// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HUD_SURFACE_SCHEMA, type SurfaceSourceBinding } from "@shared/helix-hud-surface";
import SurfaceRegistryStatus from "../SurfaceRegistryStatus";

const binding: SurfaceSourceBinding = { schema: HUD_SURFACE_SCHEMA, profileId: "motorcycle-awareness", runId: "fixture:rear", sourceId: "fixture", producerEpoch: "epoch-1", sourceKind: "simulator", locatorRef: "fixture:source", permission: "not_required", retention: "none" };
const surface = {
  schema: "helix.surface_registry.v1", surface_instance_id: "surface-1", owner_profile_id: "profile:developer", revision: 1, status: "active",
  desired_state: { profile_id: binding.profileId, run_id: binding.runId, source: { source_id: binding.sourceId, producer_epoch: binding.producerEpoch, source_kind: binding.sourceKind }, composition_mode: "hud_over_source", transform_ref: "normalized-unit-rect-v1", output_target: "workstation_preview" },
  output_lease: null, created_at: "2026-09-04T18:00:00.000Z", updated_at: "2026-09-04T18:00:00.000Z", state_hash: "a".repeat(64), program_input_authority: false, reflex_authority: false, model_answer_authority: false,
};

describe("SurfaceRegistryStatus", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("projects canonical state and lets the user issue the bounded Codex lease", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, surfaces: [surface] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, lease: { schema: "helix.surface_control_lease.v1", control_lease_id: "lease-1", surface_instance_id: "surface-1", owner_profile_id: "profile:developer", thread_id: "motorcycle-hud-lab", bound_profile_id: binding.profileId, bound_source_id: binding.sourceId, bound_producer_epoch: binding.producerEpoch, permitted_operations: ["configure", "blank", "release"], issued_at: "2026-09-04T18:00:00.000Z", expires_at: "2026-09-04T18:05:00.000Z", status: "active", revoked_at: null } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SurfaceRegistryStatus binding={binding} />);
    await screen.findByText("Canonical state synchronized.");
    expect(screen.getByTestId("surface-registry-status").textContent).toMatch(/one canonical state for UI and MCP/i);
    fireEvent.click(screen.getByRole("button", { name: /Grant Codex 5m/i }));
    await screen.findByText(/Five-minute, thread-bound Codex lease issued/i);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/hud-surfaces/surface-1/control-leases");
    const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ thread_id: "motorcycle-hud-lab", duration_ms: 300_000 });
    await waitFor(() => expect(screen.getAllByText("active").length).toBe(2));
  });

  it("routes the owning HUD Emergency Blank through the registry", async () => {
    const blanked = { ...surface, revision: 2, status: "blanked", state_hash: "b".repeat(64) };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, surfaces: [surface] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, surface: blanked }) });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<SurfaceRegistryStatus binding={binding} emergencyBlankRequest={0} />);
    await screen.findByText("Canonical state synchronized.");
    view.rerender(<SurfaceRegistryStatus binding={binding} emergencyBlankRequest={1} />);
    await screen.findByText(/Emergency Blank released output and control leases/i);
    expect(JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body))).toEqual({ operation: "blank", expected_revision: 1, reason: "emergency_blank" });
  });
});
