/** Archive probes require confirmed runtime capability and an image request. */
export function sunpyProbeAllowed(runtime: { available: boolean } | null, maxFrames: number): boolean {
  return runtime?.available === true && Number.isInteger(maxFrames) && maxFrames > 0 && maxFrames <= 40;
}

/** Preserve the explicit HEK-only sentinel; invalid requests never fetch data. */
export function sunpyMaxFramesQuery(value: number | null | undefined): string {
  const frames = value ?? 10;
  if (!Number.isInteger(frames) || frames < 0 || frames > 40) {
    throw new Error("maxFrames must be an integer between 0 and 40");
  }
  return String(frames);
}
