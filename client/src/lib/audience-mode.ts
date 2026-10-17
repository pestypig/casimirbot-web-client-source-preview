export type AudienceMode = "public" | "academic";

const PUBLIC_BLOCKLIST = [/speculative/i, /internal/i, /proxy[-_ ]derived/i];

export function sanitizeAudienceText(text: string, mode: AudienceMode): string {
  if (mode !== "public") return text;
  let next = text;
  for (const pat of PUBLIC_BLOCKLIST) {
    next = next.replace(pat, "");
  }
  return next.replace(/\s{2,}/g, " ").trim();
}

export function formatDerivationLabel(args: {
  mode: AudienceMode;
  metricDerived?: boolean;
  sourceLabel?: string;
}): string {
  const source = args.sourceLabel ? String(args.sourceLabel) : "unknown";
  if (args.mode === "public") {
    return args.metricDerived ? "geometry-derived" : "operational estimate";
  }
  return args.metricDerived ? `geometry-derived (${source})` : `proxy-derived (${source})`;
}

export function resolveMetricClaimLabel(args: {
  mode: AudienceMode;
  strictMode?: boolean;
  metricContractOk?: boolean;
  metricDerived?: boolean;
  sourceLabel?: string;
}): string {
  if (args.strictMode && args.metricDerived && args.metricContractOk !== true) {
    return args.mode === "public" ? "metric claim unavailable" : "metric claim unavailable (contract missing)";
  }
  return formatDerivationLabel(args);
}
