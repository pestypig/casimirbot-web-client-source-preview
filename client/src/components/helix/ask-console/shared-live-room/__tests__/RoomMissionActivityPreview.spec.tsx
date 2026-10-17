// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RoomMissionOwnerSelection } from "@shared/helix-room-mission-owner";
import { RoomMissionActivityPreview } from "../RoomMissionActivityPreview";
import { readRoomMissionActivityPage } from "../RoomMissionActivityApi";

const mission: RoomMissionOwnerSelection = {
  room_id: "room:one", mission_id: "mission:one", mission_revision: 1,
  status: "active", reasoning_binding_id: "binding:one", binding_epoch: 2,
  helix_conversation_id: "chat:one", binding_mission_id: null, run_id: "run:one",
};
const page = {
  schema: "helix.verified_owner_mission_activity_page.v1",
  run_id: "run:one", projections: [], next_cursor: null,
  session_identity: { mission_id: "mission:one", mission_revision: 1,
    binding_epoch: 2, producer_epoch_ref: "producer:one",
    action_authority_ref: "authority:one",
    scope: { schema: "helix.environment_mission_activity_scope.v1",
      profile_ref: "profile:owner", node_ref: "node:one", run_id: "run:one",
      room_ref: "room:one", environment_binding_ref: "environment:one",
      source_ref: "source:one", world_ref: "world:one" } },
  poll_cursor: "opaque-poll", has_more: false, complete_for_query: true,
  content_role: "mission_activity_not_assistant_answer",
  answer_authority: false, assistant_answer: false,
  terminal_eligible: false, raw_content_included: false,
  private_reasoning_included: false, action_authority_granted: false,
} as const;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status,
    headers: { "Content-Type": "application/json" } });

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("read-only mission activity preview", () => {
  it("requests only the owner route and renders a labeled in-app preview", async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => json(page));
    vi.stubGlobal("fetch", fetcher);
    const view = render(<RoomMissionActivityPreview mission={mission} />);
    await waitFor(() => expect(screen.getByText(/Verified public activity only/)).toBeTruthy());
    expect(screen.getByText(/separate over-game HUD is optional/)).toBeTruthy();
    expect(fetcher).toHaveBeenCalledWith(
      "/api/account/session/operator-activity/mission-overlay?room_id=room%3Aone",
      expect.objectContaining({ credentials: "same-origin", cache: "no-store" }),
    );
    const signal = fetcher.mock.calls[0]?.[1]?.signal as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
  });

  it("sends only exact mission selectors to the native HUD on an explicit click", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(page)));
    const show = vi.fn(async (_selection: unknown) => ({ status: "waiting" }));
    const stop = vi.fn(async () => ({ status: "stopped" }));
    vi.stubGlobal("casimirDesktop", { showEnvironmentMissionHud: show,
      stopEnvironmentMissionHud: stop });
    render(<RoomMissionActivityPreview mission={mission} />);
    expect(show).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Show over-game HUD" }));
    await waitFor(() => expect(show).toHaveBeenCalledWith({
      roomId: "room:one", missionId: "mission:one", missionRevision: 1,
      bindingEpoch: 2, runId: "run:one",
    }));
    expect(screen.getByText(/appears only when this exact client/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stop over-game HUD" }));
    await waitFor(() => expect(screen.getByText("Over-game HUD stopped.")).toBeTruthy());
    expect(stop).toHaveBeenCalledOnce();
  });

  it("rejects a foreign run or authority-bearing response", async () => {
    const fetcher = vi.fn(async () => json({ ...page, run_id: "run:foreign" }));
    vi.stubGlobal("fetch", fetcher);
    await expect(readRoomMissionActivityPage(mission, null, new AbortController().signal))
      .rejects.toMatchObject({ code: "mission_activity_response_mismatch" });
    fetcher.mockResolvedValueOnce(json({ ...page, action_authority_granted: true }));
    await expect(readRoomMissionActivityPage(mission, null, new AbortController().signal))
      .rejects.toMatchObject({ code: "mission_activity_response_mismatch" });
    fetcher.mockResolvedValueOnce(json({ ...page, session_identity: {
      ...page.session_identity, binding_epoch: 3 } }));
    await expect(readRoomMissionActivityPage(mission, null, new AbortController().signal))
      .rejects.toMatchObject({ code: "mission_activity_response_mismatch" });
  });

  it("halts this preview on a stale mission instead of showing prior events", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "mission_unavailable" }, 409)));
    render(<RoomMissionActivityPreview mission={mission} />);
    await waitFor(() => expect(screen.getByText(/Mission activity access or scope changed/)).toBeTruthy());
    expect(screen.getByText("Waiting for verified mission activity.")).toBeTruthy();
  });

  it("clears retained activity on a failed reread and recovers from the first page", async () => {
    const activity = {
      schema: "helix.environment_mission_activity_projection.v1",
      surface: "overlay", activity_event_id: "activity:one", projection_sequence: 1,
      run_id: "run:one", event_kind: "checkpoint", outcome: "succeeded",
      label: "Checkpoint", summary: "Verified checkpoint reached.",
      truncated: false, observed_at: new Date().toISOString(),
      provenance: "measured", content_role: "mission_activity_not_assistant_answer",
      answer_authority: false, assistant_answer: false, terminal_eligible: false,
      raw_content_included: false, private_reasoning_included: false,
      action_authority_granted: false,
    } as const;
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ ...page, projections: [activity] }))
      .mockResolvedValueOnce(json({ error: "internal_error" }, 500))
      .mockResolvedValueOnce(json({ ...page, projections: [activity] }));
    vi.stubGlobal("fetch", fetcher);
    let refresh: (() => void) | undefined;
    const realSetInterval = globalThis.setInterval.bind(globalThis);
    vi.spyOn(globalThis, "setInterval").mockImplementation((handler, timeout, ...args) => {
      if (timeout === 5_000) refresh = handler as () => void;
      return realSetInterval(handler, timeout, ...args);
    });
    render(<RoomMissionActivityPreview mission={mission} />);
    await waitFor(() => expect(screen.getByText("Verified checkpoint reached.")).toBeTruthy());
    await act(async () => { refresh?.(); });
    await waitFor(() => expect(screen.getByText(/temporarily unavailable/)).toBeTruthy());
    expect(screen.queryByText("Verified checkpoint reached.")).toBeNull();
    expect(screen.getByText("Waiting for verified mission activity.")).toBeTruthy();
    await act(async () => { refresh?.(); });
    await waitFor(() => expect(screen.getByText("Verified checkpoint reached.")).toBeTruthy());
    expect(fetcher.mock.calls[1]?.[0]).toContain("cursor=opaque-poll");
    expect(fetcher.mock.calls[2]?.[0]).toBe(
      "/api/account/session/operator-activity/mission-overlay?room_id=room%3Aone",
    );
  });

  it("treats lost account authentication as a scope change, not a retryable stale display", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "session_required" }, 401)));
    await expect(readRoomMissionActivityPage(mission, null, new AbortController().signal))
      .rejects.toMatchObject({ code: "mission_activity_scope_changed" });
  });
});
