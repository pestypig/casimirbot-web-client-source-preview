import type { ConnectionHealth, ConnectionHealthBlocker } from "./connectionHealth";

export const CONNECTION_HEALTH_MEMORY_KEY = "casimirbot.connection_health.v1";
export type ConnectionHealthMemory = Readonly<{
  schema: "casimirbot.connection_health.v1";
  profileHash: string;
  identityHash: string;
  verifiedAt: string;
  packageBuild: string | null;
  lastNotice: { blocker: ConnectionHealthBlocker; at: string } | null;
}>;
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export function parseConnectionHealthMemory(value: unknown): ConnectionHealthMemory | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join() !== "identityHash,lastNotice,packageBuild,profileHash,schema,verifiedAt" ||
    v.schema !== CONNECTION_HEALTH_MEMORY_KEY || !hash(v.identityHash) || !hash(v.profileHash) ||
    typeof v.verifiedAt !== "string" || !Number.isFinite(Date.parse(v.verifiedAt)) ||
    (v.packageBuild !== null && (typeof v.packageBuild !== "string" || !/^release-[a-z0-9][a-z0-9.-]*$/i.test(v.packageBuild)))) return null;
  if (v.lastNotice !== null) {
    if (!v.lastNotice || typeof v.lastNotice !== "object" || Array.isArray(v.lastNotice)) return null;
    const n = v.lastNotice as Record<string, unknown>;
    if (Object.keys(n).sort().join() !== "at,blocker" || typeof n.at !== "string" ||
      !Number.isFinite(Date.parse(n.at)) || typeof n.blocker !== "string" ||
      !["sign_in", "native_unverified", "native_setup", "operator_stop", "native_transition", "local_setup", "device_approval", "local_client", "service_read", "source_or_gateway", "oauth", "protected_read", "catalog", "package", "required_tool", "exact_task", "pairing", "runtime_binding", "none"].includes(n.blocker)) return null;
  }
  return v as ConnectionHealthMemory;
}
export function readConnectionHealthMemory(storage: Pick<Storage,"getItem">): ConnectionHealthMemory | null {
  try { return parseConnectionHealthMemory(JSON.parse(storage.getItem(CONNECTION_HEALTH_MEMORY_KEY) ?? "null")); }
  catch { return null; }
}
export function shouldNotifyConnectionChange(input: {
  health: ConnectionHealth; memory: ConnectionHealthMemory | null; now: number; optedIn: boolean;
}): boolean {
  const { health, memory, now, optedIn } = input;
  if (!optedIn || !memory || health.stopped || health.blocker === "none" ||
    health.blocker === "exact_task" || health.blocker === "required_tool" ||
    (health.route === "local_stdio" && health.blocker === "protected_read") ||
    health.blocker === "sign_in" || health.blocker === "operator_stop" ||
    !Number.isFinite(now) || Date.parse(memory.verifiedAt) > now ||
    now - Date.parse(memory.verifiedAt) > 7 * 24 * 60 * 60_000) return false;
  if (memory.lastNotice?.blocker === health.blocker &&
    now - Date.parse(memory.lastNotice.at) < 30 * 60_000) return false;
  return true;
}
