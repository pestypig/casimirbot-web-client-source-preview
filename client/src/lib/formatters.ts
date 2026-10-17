// Null-safe formatters for physics values

export const exp = (x?: number) => Number.isFinite(x!) ? x!.toExponential(1) : "—";
export const fix1 = (x?: number) => Number.isFinite(x!) ? x!.toFixed(1) : "—";
export const fix2 = (x?: number) => Number.isFinite(x!) ? x!.toFixed(2) : "—";
export const fix3 = (x?: number) => Number.isFinite(x!) ? x!.toFixed(3) : "—";
export const pct = (x?: number) => Number.isFinite(x!) ? (x!*100).toFixed(1)+"%" : "—";
export const sci = (x?: number) => Number.isFinite(x!) ? x!.toExponential(2) : "—";

// Format large numbers with proper units
export const formatMass = (kg?: number) => {
  if (!Number.isFinite(kg!)) return "—";
  if (Math.abs(kg!) >= 1e6) return exp(kg!) + " kg";
  if (Math.abs(kg!) >= 1e3) return (kg!/1e3).toFixed(1) + " Mg";
  return fix1(kg!) + " kg";
};

export const formatPower = (MW?: number) => {
  if (!Number.isFinite(MW!)) return "—";
  if (Math.abs(MW!) >= 1e3) return (MW!/1e3).toFixed(1) + " GW";
  if (Math.abs(MW!) >= 1) return fix1(MW!) + " MW";
  return (MW!*1e3).toFixed(1) + " kW";
};

export const formatEnergy = (J?: number) => {
  if (!Number.isFinite(J!)) return "—";
  if (Math.abs(J!) >= 1e6) return exp(J!) + " J";
  if (Math.abs(J!) >= 1) return fix2(J!) + " J";
  return sci(J!) + " J";
};