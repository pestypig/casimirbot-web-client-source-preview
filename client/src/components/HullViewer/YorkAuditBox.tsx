import React from "react";
import type { HullRenderCertificateV1 } from "@shared/hull-render-contract";

type YorkAuditBoxProps = {
  certificate: HullRenderCertificateV1 | null | undefined;
  metricRefHashFallback?: string | null;
  timestampMsFallback?: number | null;
  thetaDefinitionFallback?: string | null;
};

const isYorkScientificRenderView = (
  view: HullRenderCertificateV1["render"]["view"] | null | undefined,
): view is
  | "york-time-3p1"
  | "york-surface-3p1"
  | "york-surface-rho-3p1"
  | "york-topology-normalized-3p1"
  | "york-shell-map-3p1" =>
  view === "york-time-3p1" ||
  view === "york-surface-3p1" ||
  view === "york-surface-rho-3p1" ||
  view === "york-topology-normalized-3p1" ||
  view === "york-shell-map-3p1";

const formatYorkAuditNumber = (value: unknown, digits = 3): string => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "none";
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e4 || abs < 1e-3)) return n.toExponential(2);
  return n.toFixed(digits);
};

const formatYorkAuditBool = (value: unknown): string =>
  typeof value === "boolean" ? String(value) : "none";

export function YorkAuditBox(props: YorkAuditBoxProps) {
  const { certificate, metricRefHashFallback, timestampMsFallback, thetaDefinitionFallback } =
    props;
  if (!certificate || !isYorkScientificRenderView(certificate.render?.view ?? null)) {
    return null;
  }

  const diagnostics = certificate.diagnostics ?? {};
  const metricRefHash = diagnostics.metric_ref_hash ?? metricRefHashFallback ?? null;
  const timestampMs = diagnostics.timestamp_ms ?? timestampMsFallback ?? null;
  const thetaDefinition =
    diagnostics.theta_definition ?? thetaDefinitionFallback ?? null;

  return (
    <div className="mt-1 rounded border border-cyan-500/40 bg-slate-900/80 px-1.5 py-1">
      {/* Following invariant-first visualization discipline, the York figure must expose raw numeric extrema and snapshot identity so a near-flat field is read as a physical result, not as an ambiguous render artifact. Mattingly-style fixed-coordinate, auditable scientific visualization. */}
      <div className="font-semibold uppercase tracking-wide text-cyan-200">
        York Audit Box
      </div>
      <div className="mt-1 grid grid-cols-1 gap-x-3 gap-y-0.5 font-mono text-[0.58rem] text-cyan-100 sm:grid-cols-2">
        <span className="break-all">metric_ref_hash: {String(metricRefHash ?? "none")}</span>
        <span>timestamp_ms: {formatYorkAuditNumber(timestampMs, 0)}</span>
        <span className="break-all">
          theta_definition: {String(thetaDefinition ?? "none")}
        </span>
        <span>theta_min_raw: {formatYorkAuditNumber(diagnostics.theta_min_raw)}</span>
        <span>theta_max_raw: {formatYorkAuditNumber(diagnostics.theta_max_raw)}</span>
        <span>
          theta_abs_max_raw: {formatYorkAuditNumber(diagnostics.theta_abs_max_raw)}
        </span>
        <span>
          theta_min_display: {formatYorkAuditNumber(diagnostics.theta_min_display)}
        </span>
        <span>
          theta_max_display: {formatYorkAuditNumber(diagnostics.theta_max_display)}
        </span>
        <span>
          theta_abs_max_display: {formatYorkAuditNumber(diagnostics.theta_abs_max_display)}
        </span>
        <span className="break-all">
          display_range_method: {String(diagnostics.display_range_method ?? "none")}
        </span>
        <span>near_zero_theta: {formatYorkAuditBool(diagnostics.near_zero_theta)}</span>
        <span>
          zero_contour_segments:{" "}
          {formatYorkAuditNumber(diagnostics.zero_contour_segments, 0)}
        </span>
        <span>sampling_choice: {String(diagnostics.sampling_choice ?? "none")}</span>
        <span>coordinate_mode: {String(diagnostics.coordinate_mode ?? "none")}</span>
        <span>display_gain: {formatYorkAuditNumber(diagnostics.display_gain)}</span>
        <span>height_scale: {formatYorkAuditNumber(diagnostics.height_scale)}</span>
        <span>
          peak_theta_in_supported_region:{" "}
          {formatYorkAuditBool(diagnostics.peak_theta_in_supported_region)}
        </span>
      </div>
    </div>
  );
}

export default YorkAuditBox;
