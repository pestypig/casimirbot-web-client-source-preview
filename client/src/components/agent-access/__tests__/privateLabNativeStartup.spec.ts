import { describe, expect, it, vi } from "vitest";
import { DESKTOP_MCP_TUNNEL_STATE_SCHEMA_VERSION } from "@shared/desktop-mcp-tunnel";
import { resumePrivateLabNativeStartup } from "../privateLabNativeStartup";

const readyTunnel = {
  schemaVersion: DESKTOP_MCP_TUNNEL_STATE_SCHEMA_VERSION,
  transport: "openai_secure_mcp_tunnel", access: "developer_private",
  scope: "full_helix_agent", status: "ready", configured: true,
  vaultAvailable: true, binaryVersion: "0.0.13", processRunning: true,
  healthy: true, ready: true, adminUiAvailable: true, failureCode: null,
  recovery: { phase: "idle", attemptCount: 0, maxAttempts: 3,
    nextAttemptAt: null, lastReason: null,
    automaticScope: "local_supervisor_coordination_and_device_check",
    manualInterventionRequired: false },
};

describe("private lab native startup", () => {
  it("reuses an acknowledged grant without new owner review", async () => {
    const developerAccess = vi.fn(async () => ({ phase: "active", nativeLease: { lastAcknowledgedAt: 1 } }));
    const startTunnel = vi.fn(async () => readyTunnel);
    expect((await resumePrivateLabNativeStartup({ developerAccess, startTunnel, now: () => 10 })).stage).toBe("transport_ready");
    expect(developerAccess).toHaveBeenCalledTimes(1);
    expect(developerAccess).toHaveBeenCalledWith("inspect");
    expect(startTunnel).toHaveBeenCalledTimes(1);
  });

  it("offers one reviewed activation and verifies its published lease before starting", async () => {
    const developerAccess = vi.fn()
      .mockResolvedValueOnce({ phase: "inactive" })
      .mockResolvedValueOnce({ phase: "active", nativeLease: { lastAcknowledgedAt: 2 } })
      .mockResolvedValueOnce({ phase: "active", nativeLease: { lastAcknowledgedAt: 2 } });
    const startTunnel = vi.fn(async () => readyTunnel);
    expect((await resumePrivateLabNativeStartup({ developerAccess, startTunnel, now: () => 10 })).stage).toBe("transport_ready");
    expect(developerAccess.mock.calls.map(([action]) => action)).toEqual(["inspect", "activate-self", "inspect"]);
    expect(startTunnel).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["declined review", { phase: "inactive" }, "developer_access_required"],
    ["unreadable vault", { phase: "unavailable" }, "developer_access_unavailable"],
    ["unacknowledged lease", { phase: "active", nativeLease: { lastAcknowledgedAt: null } }, "native_lease_unverified"],
  ])("stops on %s without starting transport", async (_label, view, stage) => {
    const developerAccess = vi.fn(async () => view);
    const startTunnel = vi.fn(async () => readyTunnel);
    expect((await resumePrivateLabNativeStartup({ developerAccess, startTunnel })).stage).toBe(stage);
    expect(startTunnel).not.toHaveBeenCalled();
  });

  it("never interprets a read-only tunnel as full development transport", async () => {
    const startTunnel = vi.fn(async () => ({ ...readyTunnel,
      scope: "local_supervisor_coordination_and_device_check" }));
    expect((await resumePrivateLabNativeStartup({ startTunnel })).stage).toBe("transport_unverified");
  });

  it("rejects a previously acknowledged but stale native lease", async () => {
    const developerAccess = vi.fn(async () => ({ phase: "active", nativeLease: { lastAcknowledgedAt: 1 } }));
    const startTunnel = vi.fn(async () => readyTunnel);
    expect((await resumePrivateLabNativeStartup({ developerAccess, startTunnel, now: () => 31_002 })).stage)
      .toBe("native_lease_unverified");
    expect(startTunnel).not.toHaveBeenCalled();
  });
});
