// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearSurfacePanelRoutesForTests,
  HELIX_SURFACE_PANEL_ROUTE_EVENT,
  publishSurfacePanelRoute,
  readLatestSurfacePanelRoute,
} from "../surfacePanelRouting";

const receipt = {
  schema: "helix.surface_panel_route_receipt.v1" as const,
  route_id: "route-1",
  surface_instance_id: "surface-1",
  surface_revision: 3,
  target: "image_lens" as const,
  target_panel_id: "image-lens",
  context: {
    schema: "helix.panel_launch_context.v1" as const,
    panel_id: "image-lens",
    surface_instance_id: "surface-1",
    surface_revision: 3,
    profile_id: "profile",
    run_id: "run",
    source_id: "source",
    producer_epoch: "epoch",
    sequence_id: "frame-3",
    output_lease_id: "output-lease",
    requested_view: "surface-context",
    focus_target: "rear-left",
  },
  principal: { kind: "human_ui" as const, principal_id: "user", owner_profile_id: "profile", thread_id: null, control_lease_id: null },
  occurred_at: "2026-09-04T19:00:00.000Z",
  content_role: "surface_panel_route_receipt_not_assistant_answer" as const,
  assistant_answer: false as const,
  terminal_eligible: false as const,
  program_input_authority: false as const,
  reflex_authority: false as const,
  model_answer_authority: false as const,
};

describe("surface panel routing bridge", () => {
  afterEach(() => { clearSurfacePanelRoutesForTests(); vi.restoreAllMocks(); });

  it("validates, stores, and publishes the latest exact route by panel", () => {
    const listener = vi.fn();
    window.addEventListener(HELIX_SURFACE_PANEL_ROUTE_EVENT, listener);
    expect(publishSurfacePanelRoute(receipt)).toEqual(receipt);
    expect(readLatestSurfacePanelRoute("image-lens")).toEqual(receipt);
    expect(readLatestSurfacePanelRoute("motorcycle-hud-lab")).toBeNull();
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(HELIX_SURFACE_PANEL_ROUTE_EVENT, listener);
  });

  it("rejects a forged authority-bearing route receipt", () => {
    expect(() => publishSurfacePanelRoute({ ...receipt, terminal_eligible: true } as never)).toThrow();
  });
});
