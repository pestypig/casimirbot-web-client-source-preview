// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MinecraftPlayerSharingQueue } from "../MinecraftPlayerSharingQueue";

const roomId = "shared_realtime_room:guide";
const bindingId = "room_source_binding:fabric";
const actorRef = "observed_actor:0123456789abcdef01234567";
const releaseId = "minecraft_player_release:00000000-0000-4000-8000-000000000001";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});
const bindings = { ok: true, bindings: [{
  binding_id: bindingId, source_label: "Fixture world Fabric sensor",
  domain_adapter: "minecraft.fabric_mod.v1", status: "active",
}] };
const review = { schema: "helix.minecraft_player_release_review.v1",
  ok: true, binding_id: bindingId, activation_available: false,
  requests: [{ release_id: releaseId, actor_ref: actorRef,
    audience: "gpt_live", requested_at: "2026-11-01T12:00:00.000Z",
    review_until: "2026-11-01T12:15:00.000Z",
    expires_at: "2026-11-02T12:00:00.000Z",
    player_uuid: "PRIVATE-UUID-MUST-NOT-RENDER" }] };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("owner Minecraft player sharing queue", () => {
  it("shows only an opaque pending assertion and offers no approval action", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(bindings))
      .mockResolvedValueOnce(json(review));
    vi.stubGlobal("fetch", fetchMock);
    render(<MinecraftPlayerSharingQueue roomId={roomId} />);
    fireEvent.click(screen.getByRole("button", { name: "Check sharing requests" }));
    expect(await screen.findByText(actorRef)).toBeInTheDocument();
    expect(screen.getByText(/A request from the Fabric source is not permission/))
      .toBeInTheDocument();
    expect(screen.queryByText("PRIVATE-UUID-MUST-NOT-RENDER")).toBeNull();
    expect(screen.queryByRole("button", { name: /approve|allow|share/i })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(2,
      `/api/agi/realtime/rooms/${encodeURIComponent(roomId)}/source-bindings/${encodeURIComponent(bindingId)}/player-release-requests`,
      expect.objectContaining({ credentials: "same-origin", cache: "no-store" }));
    expect(fetchMock.mock.calls.every(([, init]) => !init.method || init.method === "GET"))
      .toBe(true);
  });

  it("keeps an unavailable review distinct from no pending requests", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(bindings))
      .mockResolvedValueOnce(json({ message: "disabled" }, 404)));
    render(<MinecraftPlayerSharingQueue roomId={roomId} />);
    fireEvent.click(screen.getByRole("button", { name: "Check sharing requests" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Player sharing review is not available for this room.");
    expect(screen.queryByText("No current player sharing requests for this source.")).toBeNull();
  });

  it("rejects a response that claims activation is available", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(bindings))
      .mockResolvedValueOnce(json({ ...review, activation_available: true })));
    render(<MinecraftPlayerSharingQueue roomId={roomId} />);
    fireEvent.click(screen.getByRole("button", { name: "Check sharing requests" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(
      "Player sharing review returned an invalid response."));
    expect(screen.queryByText(actorRef)).toBeNull();
  });
});
