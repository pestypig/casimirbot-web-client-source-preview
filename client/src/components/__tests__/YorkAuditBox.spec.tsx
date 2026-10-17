// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { HullRenderCertificateV1 } from "@shared/hull-render-contract";
import { YorkAuditBox } from "@/components/HullViewer/YorkAuditBox";

const buildCertificate = (
  view: HullRenderCertificateV1["render"]["view"] = "york-time-3p1",
): HullRenderCertificateV1 => ({
  certificate_schema_version: "nhm2.render-certificate.v1",
  certificate_hash: "cert-hash",
  metric_ref_hash: "metric-hash-123",
  channel_hashes: {
    theta: "theta-hash",
  },
  support_mask_hash: "support-hash",
  chart: "comoving_cartesian",
  observer: "eulerian_n",
  theta_definition: "theta=-trK",
  kij_sign_convention: "K_ij=-1/2*L_n(gamma_ij)",
  unit_system: "SI",
  camera: { pose: "pose", proj: "proj" },
  render: {
    view,
    integrator: "christoffel-rk4",
    steps: 0,
    field_key: "theta",
    slice_plane: "x-z-midplane",
    normalization: "symmetric-about-zero",
    surface_height: "theta",
    support_overlay: "hull_sdf+tile_support_mask",
    vector_context: null,
  },
  diagnostics: {
    null_residual_max: 0,
    step_convergence: 1,
    bundle_spread: 0,
    constraint_rms: 0,
    support_coverage_pct: 100,
    metric_ref_hash: "metric-hash-123",
    timestamp_ms: 1700000000000,
    theta_definition: "theta=-trK",
    theta_min_raw: -1e-9,
    theta_max_raw: 2e-9,
    theta_abs_max_raw: 2e-9,
    theta_min_display: -1e-12,
    theta_max_display: 1e-12,
    theta_abs_max_display: 1e-12,
    display_range_method: "computeSliceRange:diverging:p98-abs-symmetric",
    theta_min: -1e-12,
    theta_max: 1e-12,
    theta_abs_max: 1e-12,
    near_zero_theta: false,
    zero_contour_segments: 42,
    sampling_choice: "x-z midplane",
    coordinate_mode: "x-z-midplane",
    display_gain: 1,
    height_scale: 0.9,
    peak_theta_in_supported_region: true,
  },
  frame_hash: "frame-hash",
  timestamp_ms: 1700000000000,
});

describe("YorkAuditBox", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders full York audit fields for York scientific views", () => {
    render(
      <YorkAuditBox
        certificate={buildCertificate("york-topology-normalized-3p1")}
      />,
    );

    expect(screen.getByText("York Audit Box")).toBeDefined();
    expect(screen.getByText(/metric_ref_hash:/i)).toBeDefined();
    expect(screen.getByText(/timestamp_ms:/i)).toBeDefined();
    expect(screen.getByText(/theta_definition:/i)).toBeDefined();
    expect(screen.getByText(/theta_min_raw:/i)).toBeDefined();
    expect(screen.getByText(/theta_max_raw:/i)).toBeDefined();
    expect(screen.getByText(/theta_abs_max_raw:/i)).toBeDefined();
    expect(screen.getByText(/theta_min_display:/i)).toBeDefined();
    expect(screen.getByText(/theta_max_display:/i)).toBeDefined();
    expect(screen.getByText(/theta_abs_max_display:/i)).toBeDefined();
    expect(screen.getByText(/display_range_method:/i)).toBeDefined();
    expect(screen.getByText(/near_zero_theta:/i)).toBeDefined();
    expect(screen.getByText(/zero_contour_segments:/i)).toBeDefined();
    expect(screen.getByText(/sampling_choice:/i)).toBeDefined();
    expect(screen.getByText(/coordinate_mode:/i)).toBeDefined();
    expect(screen.getByText(/display_gain:/i)).toBeDefined();
    expect(screen.getByText(/height_scale:/i)).toBeDefined();
    expect(screen.getByText(/peak_theta_in_supported_region:/i)).toBeDefined();
  });

  it("does not render for non-York views", () => {
    render(<YorkAuditBox certificate={buildCertificate("full-atlas")} />);
    expect(screen.queryByText("York Audit Box")).toBeNull();
  });
});
