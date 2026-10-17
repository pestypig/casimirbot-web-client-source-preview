export const REASONING_THEATER_EVENT_EXTRAPOLATION_HOLD_MS = 1400;
export const REASONING_THEATER_STALLED_WARNING_METER_MAX = 78;

export function resolveReasoningTheaterExtrapolatedElapsedMs(input: {
  baseElapsedMs: number;
  elapsedSinceAnchorMs: number;
}): number {
  const baseElapsedMs = Number.isFinite(input.baseElapsedMs) ? Math.max(0, input.baseElapsedMs) : 0;
  const elapsedSinceAnchorMs = Number.isFinite(input.elapsedSinceAnchorMs)
    ? Math.max(0, input.elapsedSinceAnchorMs)
    : 0;
  return (
    baseElapsedMs +
    Math.min(elapsedSinceAnchorMs, REASONING_THEATER_EVENT_EXTRAPOLATION_HOLD_MS)
  );
}

export function resolveReasoningTheaterMeterTargetForClock(input: {
  rawTargetPct: number;
  eventQuietMs: number;
}): number {
  const rawTargetPct = Number.isFinite(input.rawTargetPct) ? input.rawTargetPct : 50;
  const eventQuietMs = Number.isFinite(input.eventQuietMs) ? Math.max(0, input.eventQuietMs) : 0;
  if (eventQuietMs <= REASONING_THEATER_EVENT_EXTRAPOLATION_HOLD_MS) {
    return rawTargetPct;
  }
  return Math.min(rawTargetPct, REASONING_THEATER_STALLED_WARNING_METER_MAX);
}
