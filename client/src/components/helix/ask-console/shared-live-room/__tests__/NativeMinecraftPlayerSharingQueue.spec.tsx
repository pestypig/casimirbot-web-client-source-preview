// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeMinecraftPlayerSharingQueue } from
  "../NativeMinecraftPlayerSharingQueue";

const roomId = "shared_realtime_room:guide";
const bindingId = "room_source_binding:fabric";
const actorRef = "observed_actor:0123456789abcdef01234567";
const inventory = { schema: "casimir.native_hosted_room_source_inventory.v1",
  room_id: roomId, bindings: [{ binding_id: bindingId,
    world_id: "minecraft:fallen-city",
    domain_adapter: "minecraft.fabric_mod.v1", status: "active" }] };
const review = { schema: "helix.minecraft_player_release_review.v1",
  room_id: roomId, binding_id: bindingId, activation_available: false,
  requests: [{
    release_id: "minecraft_player_release:00000000-0000-4000-8000-000000000001",
    actor_ref: actorRef, audience: "gpt_live",
    review_until: "2026-11-02T12:00:00Z",
    raw_player_uuid: "PRIVATE-UUID-MUST-NOT-RENDER",
  }] };

afterEach(cleanup);

describe("native Minecraft player sharing queue", () => {
  it("reads the selected Fabric source and displays no activation control", async () => {
    const control = vi.fn().mockResolvedValueOnce(inventory)
      .mockResolvedValueOnce(review);
    render(<NativeMinecraftPlayerSharingQueue roomId={roomId} control={control} />);
    fireEvent.click(screen.getByRole("button", { name: "Check sharing requests" }));
    expect(await screen.findByText(actorRef)).toBeInTheDocument();
    expect(control).toHaveBeenNthCalledWith(1, { operation: "source_list",
      room_id: roomId });
    expect(control).toHaveBeenNthCalledWith(2, {
      operation: "source_player_release_requests", room_id: roomId,
      request: { binding_id: bindingId },
    });
    expect(screen.queryByText("PRIVATE-UUID-MUST-NOT-RENDER")).toBeNull();
    expect(screen.queryByRole("button", { name: /approve|allow|share/i })).toBeNull();
  });

  it("does not show an empty queue when the native read fails", async () => {
    const control = vi.fn().mockResolvedValueOnce(inventory)
      .mockRejectedValueOnce(new Error("room_remote_rejected"));
    render(<NativeMinecraftPlayerSharingQueue roomId={roomId} control={control} />);
    fireEvent.click(screen.getByRole("button", { name: "Check sharing requests" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The player sharing review could not be read.");
    expect(screen.queryByText("No pending player sharing requests for this source."))
      .toBeNull();
  });
  it.each([
    ["source_binding_forbidden (HTTP 403)", "Room chat and source access are separate permissions."],
    ["room_connection_required (HTTP 409)", "Refresh the room connection."],
    ["insufficient_scope (HTTP 403)", "lacks the source-review scope"],
    ["room_forbidden (HTTP 403)", "verify the owner account and current membership"],
  ])("shows the matching recovery action for %s", async (message, recovery) => {
    const control = vi.fn().mockRejectedValueOnce(new Error(message));
    render(<NativeMinecraftPlayerSharingQueue roomId={roomId} control={control} />);
    fireEvent.click(screen.getByRole("button", { name: "Check sharing requests" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(recovery);
    expect(control).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/No pending player sharing requests/)).toBeNull();
  });
  it("does not display untrusted remote error text", async () => {
    const control = vi.fn().mockRejectedValueOnce(new Error("source_binding_forbidden PRIVATE-DETAIL"));
    render(<NativeMinecraftPlayerSharingQueue roomId={roomId} control={control} />);
    fireEvent.click(screen.getByRole("button", { name: "Check sharing requests" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be read");
    expect(screen.queryByText(/PRIVATE-DETAIL/)).toBeNull();
  });
});
