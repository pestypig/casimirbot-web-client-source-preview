import {
  parseDesktopMcpTunnelState,
  type DesktopMcpTunnelState,
} from "@shared/desktop-mcp-tunnel";

type DeveloperView = Readonly<{
  phase: "active" | "inactive" | "unavailable";
  nativeLease?: Readonly<{ lastAcknowledgedAt: number | null }>;
}>;

export type PrivateLabNativeStartupResult = Readonly<{
  stage: "transport_ready" | "developer_access_required" | "developer_access_unavailable" | "native_lease_unverified" | "transport_unverified";
  tunnel: DesktopMcpTunnelState | null;
}>;

const readDeveloperView = (value: unknown): DeveloperView | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.phase !== "active" && candidate.phase !== "inactive" && candidate.phase !== "unavailable") return null;
  const lease = candidate.nativeLease;
  if (lease !== undefined && (lease === null || typeof lease !== "object" || Array.isArray(lease) ||
      !((lease as Record<string, unknown>).lastAcknowledgedAt === null ||
        (typeof (lease as Record<string, unknown>).lastAcknowledgedAt === "number" &&
          Number.isFinite((lease as Record<string, number>).lastAcknowledgedAt))))) return null;
  return candidate as DeveloperView;
};

/**
 * Resume only the native portion of private development startup. The native
 * controller owns issuer/USB review and publishes the short developer lease;
 * this renderer never creates a grant or assumes that tunnel Ready is an
 * authenticated Codex task, task pairing, game authority, or model budget.
 */
export async function resumePrivateLabNativeStartup(ports: Readonly<{
  developerAccess?: (action: string) => Promise<unknown>;
  startTunnel: () => Promise<unknown>;
  now?: () => number;
}>): Promise<PrivateLabNativeStartupResult> {
  if (ports.developerAccess) {
    let view = readDeveloperView(await ports.developerAccess("inspect"));
    if (!view || view.phase === "unavailable")
      return { stage: "developer_access_unavailable", tunnel: null };
    if (view.phase === "inactive") {
      // Exactly one owner-reviewed native attempt per Start click. An uncertain
      // result is inspected, never replayed as a fresh grant automatically.
      await ports.developerAccess("activate-self");
      view = readDeveloperView(await ports.developerAccess("inspect"));
    }
    if (!view || view.phase === "unavailable")
      return { stage: "developer_access_unavailable", tunnel: null };
    if (view.phase !== "active")
      return { stage: "developer_access_required", tunnel: null };
    const acknowledgedAt = view.nativeLease?.lastAcknowledgedAt;
    const now = (ports.now ?? Date.now)();
    if (acknowledgedAt === null || acknowledgedAt === undefined ||
        acknowledgedAt > now + 1_000 || now - acknowledgedAt > 30_000)
      return { stage: "native_lease_unverified", tunnel: null };
  }
  const tunnel = parseDesktopMcpTunnelState(await ports.startTunnel());
  if (!tunnel || !tunnel.ready || tunnel.scope !== "full_helix_agent")
    return { stage: "transport_unverified", tunnel };
  return { stage: "transport_ready", tunnel };
}
