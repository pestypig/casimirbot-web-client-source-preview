export const HELIX_WORKSTATION_GUIDANCE_EVENT = "helix-workstation-guidance";

export type WorkstationGuidanceKind = "user_attention" | "tool_activity";

export type WorkstationGuidanceRequest = Readonly<{
  kind: WorkstationGuidanceKind;
  panelId?: string;
  targetId?: string;
  controlId?: string;
  label: string;
  durationMs?: number;
}>;

let pendingGuidance:
  | Readonly<{
      request: WorkstationGuidanceRequest;
      expiresAt: number;
    }>
  | null = null;

const cleanToken = (value: unknown, maxLength = 180): string | undefined => {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, maxLength);
  return cleaned || undefined;
};

export const coerceWorkstationGuidanceRequest = (
  value: unknown,
): WorkstationGuidanceRequest | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.kind !== "user_attention" && record.kind !== "tool_activity")
    return null;
  if (typeof record.label !== "string") return null;
  const label = record.label
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
  if (!label) return null;
  const durationCandidate = Number(record.durationMs);
  return Object.freeze({
    kind: record.kind,
    panelId: cleanToken(record.panelId),
    targetId: cleanToken(record.targetId),
    controlId: cleanToken(record.controlId),
    label,
    durationMs: Number.isFinite(durationCandidate)
      ? Math.max(1200, Math.min(12_000, Math.round(durationCandidate)))
      : undefined,
  });
};

export const requestWorkstationGuidance = (
  request: WorkstationGuidanceRequest,
): void => {
  if (typeof window === "undefined") return;
  const safe = coerceWorkstationGuidanceRequest(request);
  if (!safe) return;
  pendingGuidance = Object.freeze({
    request: safe,
    expiresAt: Date.now() + (safe.durationMs ?? 5200),
  });
  window.dispatchEvent(
    new CustomEvent(HELIX_WORKSTATION_GUIDANCE_EVENT, { detail: safe }),
  );
};

/**
 * Native presentation can open a panel before its contents have mounted. Keep
 * the latest short-lived presentation available for exactly one late consumer
 * so the mounted control can perform its read-only readiness refresh.
 */
export const consumePendingWorkstationGuidance =
  (): WorkstationGuidanceRequest | null => {
    const pending = pendingGuidance;
    pendingGuidance = null;
    if (!pending || pending.expiresAt < Date.now()) return null;
    return pending.request;
  };

export const clearPendingWorkstationGuidance = (): void => {
  pendingGuidance = null;
};
