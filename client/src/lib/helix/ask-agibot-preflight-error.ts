const AGIBOT_PREFLIGHT_SCOPE_ERROR_RE =
  /\bDESKTOP_JOINT_SCOPE_REQUIRED\b|desktop joint scope is required|mission interface blocked by bring-up preflight gate|preflight_gate/i;

export function isAgibotPreflightScopeError(error: unknown): boolean {
  if (!error) return false;
  const rawMessage =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : typeof (error as { message?: unknown }).message === "string"
          ? String((error as { message?: unknown }).message)
          : "";
  if (!rawMessage) return false;
  return AGIBOT_PREFLIGHT_SCOPE_ERROR_RE.test(rawMessage);
}
