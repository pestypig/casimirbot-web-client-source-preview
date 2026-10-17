export function parseHelixEnvBooleanValue(value: unknown, fallback: boolean): boolean {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return fallback;
}

export function parseHelixEnvNumberValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseHelixEnvPercentValue(value: unknown, fallback: number): number {
  const raw = String(value ?? "").trim();
  const normalizedFallback = Math.max(0, Math.min(100, fallback));
  if (!raw) return normalizedFallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return normalizedFallback;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

export function parseHelixEnvOneFlagValue(value: unknown, fallback = false): boolean {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1";
}

export function parseHelixEnvEnabledUnlessZeroValue(value: unknown, fallback = true): boolean {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw !== "0";
}

export function parseHelixEnvEnabledUnlessExactZeroValue(value: unknown, fallback = true): boolean {
  if (value === undefined) return fallback;
  return String(value) !== "0";
}

export function readHelixEnvBoolean(
  env: Record<string, unknown> | null | undefined,
  key: string,
  fallback: boolean,
): boolean {
  return parseHelixEnvBooleanValue(env?.[key], fallback);
}

export function readHelixEnvNumber(
  env: Record<string, unknown> | null | undefined,
  key: string,
  fallback: number,
): number {
  return parseHelixEnvNumberValue(env?.[key], fallback);
}

export function readHelixEnvPercent(
  env: Record<string, unknown> | null | undefined,
  key: string,
  fallback: number,
): number {
  return parseHelixEnvPercentValue(env?.[key], fallback);
}

export function readHelixEnvOneFlag(
  env: Record<string, unknown> | null | undefined,
  key: string,
  fallback = false,
): boolean {
  return parseHelixEnvOneFlagValue(env?.[key], fallback);
}

export function readHelixEnvEnabledUnlessZero(
  env: Record<string, unknown> | null | undefined,
  key: string,
  fallback = true,
): boolean {
  return parseHelixEnvEnabledUnlessZeroValue(env?.[key], fallback);
}

export function readHelixEnvEnabledUnlessExactZero(
  env: Record<string, unknown> | null | undefined,
  key: string,
  fallback = true,
): boolean {
  return parseHelixEnvEnabledUnlessExactZeroValue(env?.[key], fallback);
}
