// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SurfaceWorkspacePanel from "../SurfaceWorkspacePanel";

const testState = vi.hoisted(() => ({ openPanel: vi.fn() }));
vi.mock("@/store/useWorkstationLayoutStore", () => ({
  useWorkstationLayoutStore: (selector: (state: unknown) => unknown) => selector({ openPanelInActiveGroup: testState.openPanel }),
}));

const surface = {
  schema: "helix.surface_registry.v1", surface_instance_id: "surface-1", owner_profile_id: "profile-owner", revision: 1, status: "active",
  desired_state: { profile_id: "hud-profile", run_id: "run-1", source: { source_id: "radar", producer_epoch: "epoch-1", source_kind: "simulator" }, composition_mode: "hud_over_source", transform_ref: "normalized-unit-rect-v1", output_target: "workstation_preview" },
  output_lease: { schema: "helix.surface_registry.v1", output_lease_id: "output-1", surface_instance_id: "surface-1", owner_profile_id: "profile-owner", source_id: "radar", producer_epoch: "epoch-1", output_target: "workstation_preview", status: "active", issued_at: "2026-09-04T19:00:00.000Z", expires_at: "2026-09-04T19:15:00.000Z", released_at: null, release_reason: "none" },
  created_at: "2026-09-04T19:00:00.000Z", updated_at: "2026-09-04T19:00:00.000Z", state_hash: "state-hash", program_input_authority: false, reflex_authority: false, model_answer_authority: false,
} as const;

const route = {
  schema: "helix.surface_panel_route_receipt.v1", route_id: "route-1", surface_instance_id: "surface-1", surface_revision: 1, target: "image_lens", target_panel_id: "image-lens",
  context: { schema: "helix.panel_launch_context.v1", panel_id: "image-lens", surface_instance_id: "surface-1", surface_revision: 1, profile_id: "hud-profile", run_id: "run-1", source_id: "radar", producer_epoch: "epoch-1", sequence_id: null, output_lease_id: "output-1", requested_view: "surface-context", focus_target: "surface-1" },
  principal: { kind: "human_ui", principal_id: "user", owner_profile_id: "profile-owner", thread_id: null, control_lease_id: null }, occurred_at: "2026-09-04T19:00:01.000Z",
  content_role: "surface_panel_route_receipt_not_assistant_answer", assistant_answer: false, terminal_eligible: false, program_input_authority: false, reflex_authority: false, model_answer_authority: false,
} as const;

describe("SurfaceWorkspacePanel", () => {
  beforeEach(() => {
    testState.openPanel.mockReset();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/panel-routes") && init?.method === "POST") return { ok: true, json: async () => ({ ok: true, surface, route }) } as Response;
      if (path === "/api/hud-surfaces/") return { ok: true, json: async () => ({ ok: true, surfaces: [surface] }) } as Response;
      return { ok: true, json: async () => ({ ok: true, surface, receipts: [], route_receipts: [] }) } as Response;
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("shows canonical state and opens a validated typed route", async () => {
    render(<SurfaceWorkspacePanel />);
    expect(await screen.findByText("Canonical Surface Registry synchronized.")).toBeTruthy();
    expect(screen.getByDisplayValue("hud_over_source")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Image Lens/i }));
    await waitFor(() => expect(testState.openPanel).toHaveBeenCalledWith("image-lens"));
    expect(await screen.findByText(/Opened image-lens with validated surface context/i)).toBeTruthy();
  });
});
