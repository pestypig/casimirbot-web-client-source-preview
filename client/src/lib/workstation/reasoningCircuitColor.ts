export type WorkstationCircuitColor = {
  hsl: string;
  border: string;
  background: string;
  glow: string;
};

export const workstationCircuitColor = (
  value: string,
  fallback = "packet",
): WorkstationCircuitColor => {
  let hash = 0;
  for (const char of value || fallback) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return {
    hsl: `hsl(${hue} 84% 62%)`,
    border: `hsl(${hue} 78% 52%)`,
    background: `hsl(${hue} 72% 24% / 0.28)`,
    glow: `0 0 0 1px hsl(${hue} 78% 52% / 0.45), 0 0 18px hsl(${hue} 84% 62% / 0.22)`,
  };
};

export const workstationCircuitSwatch = (
  value: string,
  fallback = "microdeck",
): { backgroundColor: string; borderColor: string } => {
  const color = workstationCircuitColor(value, fallback);
  return {
    backgroundColor: color.hsl,
    borderColor: color.border,
  };
};

export const workstationMicroDeckColorKey = (input: {
  sourceKind: string;
  sourceId?: string | null;
  deckId: string;
}): string => [
  "microdeck",
  input.sourceKind,
  input.sourceId || "source-pending",
  input.deckId,
].join(":");
