// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildTheoryRuntimeOutputManifestV1,
  buildTheoryRuntimeReceiptV1,
  type TheoryRuntimeReceiptV1,
} from "@shared/contracts/theory-runtime-receipt.v1";
import { RuntimeReceiptStatusLamps } from "../RuntimeReceiptStatusLamps";

afterEach(() => cleanup());

function makeReceipt(): TheoryRuntimeReceiptV1 {
  return buildTheoryRuntimeReceiptV1({
    generatedAt: "2026-07-18T12:00:01.000Z",
    receiptId: "receipt:status-lamps",
    runtimeId: "nhm2.shift_lapse.alpha_sweep",
    graphId: "graph:nhm2",
    badgeIds: ["nhm2.formal.lean_certificate"],
    command: "npm run warp:full-solve:nhm2-shift-lapse:selected",
    args: {},
    status: "completed",
    outputs: {
      artifacts: ["artifacts/source-closure.json", "artifacts/campaign-certificate.json"],
      scalars: {},
      units: {},
      gates: {
        source_closure: "pass",
        certificate_integrity: "pass",
      },
      missingSignals: [],
      warnings: [],
    },
    provenance: {
      gitSha: null,
      startedAt: null,
      completedAt: "2026-07-18T12:00:01.000Z",
      durationMs: null,
    },
    claimBoundary: {
      currentTier: "diagnostic",
      maximumTier: "reduced_order",
      promotionAllowed: false,
      promotionBlockedBy: [],
    },
  });
}

describe("RuntimeReceiptStatusLamps", () => {
  it("keeps aggregate completion separate from artifact review, unbound provenance, and unknown certificate integrity", () => {
    const receipt = makeReceipt();
    receipt.outputs.gates = {
      source_closure_aggregate: "pass",
      source_closure_artifact: "review",
      certificate_integrity: "unknown",
    };

    render(
      <RuntimeReceiptStatusLamps
        receipt={receipt}
        aggregateStatus="complete"
        aggregateLabel="Aggregate section"
      />,
    );

    expect(screen.getByTestId("runtime-status-lamp-aggregate")).toHaveAttribute("data-status", "complete");
    expect(screen.getByTestId("runtime-status-lamp-evidence")).toHaveAttribute("data-status", "review");
    expect(screen.getByTestId("runtime-status-lamp-provenance")).toHaveAttribute("data-status", "unbound");
    expect(screen.getByTestId("runtime-status-lamp-certificate")).toHaveAttribute("data-status", "unknown");
    expect(screen.getByTestId("runtime-status-non-override-note")).toHaveTextContent(/does not override artifact evidence review/i);
    expect(within(screen.getByTestId("runtime-evidence-gate-details")).getByText("source_closure_aggregate: pass")).toBeInTheDocument();
    expect(within(screen.getByTestId("runtime-evidence-gate-details")).getByText("source_closure_artifact: review")).toBeInTheDocument();
    expect(screen.getByText(/campaign-certificate\.json: evidence unreported; freshness unbound; SHA-256 unreported/i)).toBeInTheDocument();
  });

  it("reports fresh only when execution identity, manifest artifacts, explicit gates, and certificate integrity are bound", () => {
    const receipt = makeReceipt();
    receipt.outputs.artifacts = [
      "artifacts/theory-runtime/run-1/source-closure.json",
      "artifacts/theory-runtime/run-1/campaign-certificate.json",
    ];
    receipt.outputs.gates = {
      source_closure: "pass",
      certificate_integrity: "pass",
      runtime_execution_provenance: "pass",
      runtime_artifact_freshness: "pass",
    };
    receipt.provenance = {
      gitSha: "75a81ee0f44d3fc3651e6fe1681f6b3113bbb396",
      startedAt: "2026-07-18T12:00:00.000Z",
      completedAt: "2026-07-18T12:00:01.000Z",
      durationMs: 1000,
    };
    receipt.execution = {
      command: "npm run warp:full-solve:nhm2-shift-lapse:selected",
      args: [],
      cwd: "C:/workspace/CasimirBot",
      environment: {},
      outputDirectory: "artifacts/theory-runtime/run-1",
      outputDirectoryBound: true,
      exitCode: 0,
      stdout: "",
      stderr: "",
      timedOut: false,
      error: null,
    };
    receipt.outputs.artifactManifest = buildTheoryRuntimeOutputManifestV1({
      generatedAt: "2026-07-18T12:00:01.000Z",
      requestId: "request:run-1",
      runtimeId: receipt.runtimeId,
      gitSha: receipt.provenance.gitSha,
      startedAt: receipt.provenance.startedAt,
      completedAt: receipt.provenance.completedAt,
      manifestPath: "artifacts/theory-runtime/run-1/manifest.json",
      manifestSha256: "c".repeat(64),
      outputDirectory: "artifacts/theory-runtime/run-1",
      boundToExecution: true,
      entries: [
        {
          path: receipt.outputs.artifacts[0],
          sha256: "a".repeat(64),
          sizeBytes: 100,
          modifiedAt: "2026-07-18T12:00:00.500Z",
          freshness: "new",
        },
        {
          path: receipt.outputs.artifacts[1],
          sha256: "b".repeat(64),
          sizeBytes: 200,
          modifiedAt: "2026-07-18T12:00:00.750Z",
          freshness: "changed",
        },
      ],
    });

    render(<RuntimeReceiptStatusLamps receipt={receipt} />);

    expect(screen.getByTestId("runtime-status-lamp-aggregate")).toHaveAttribute("data-status", "completed");
    expect(screen.getByTestId("runtime-status-lamp-evidence")).toHaveAttribute("data-status", "pass");
    expect(screen.getByTestId("runtime-status-lamp-provenance")).toHaveAttribute("data-status", "fresh");
    expect(screen.getByTestId("runtime-status-lamp-certificate")).toHaveAttribute("data-status", "pass");
    expect(screen.queryByTestId("runtime-status-non-override-note")).not.toBeInTheDocument();
    expect(screen.getByTestId("runtime-status-lamp-provenance")).toHaveTextContent("1 new / 1 changed");
    expect(screen.getByTestId("runtime-status-lamp-certificate")).toHaveTextContent(`SHA-256 ${"b".repeat(12)}`);

    cleanup();
    receipt.outputs.gates.runtime_artifact_freshness = "not_ready";
    render(<RuntimeReceiptStatusLamps receipt={receipt} />);
    expect(screen.getByTestId("runtime-status-lamp-provenance")).toHaveAttribute("data-status", "not_ready");

    cleanup();
    receipt.outputs.gates.runtime_artifact_freshness = "pass";
    receipt.outputs.artifacts = ["artifacts/outside-run/source-closure.json"];
    render(<RuntimeReceiptStatusLamps receipt={receipt} />);
    expect(screen.getByTestId("runtime-status-lamp-provenance")).toHaveAttribute("data-status", "unbound");
    expect(screen.getByTestId("runtime-status-lamp-provenance")).toHaveTextContent(/output-boundary agreement/i);
  });

  it("surfaces preexisting artifacts as a distinct freshness caution", () => {
    const receipt = makeReceipt();
    receipt.outputs.artifacts = [
      "artifacts/theory-runtime/run-2/source-closure.json",
      "artifacts/theory-runtime/run-2/campaign-certificate.json",
    ];
    receipt.provenance = {
      gitSha: "75a81ee0f44d3fc3651e6fe1681f6b3113bbb396",
      startedAt: "2026-07-18T12:00:00.000Z",
      completedAt: "2026-07-18T12:00:01.000Z",
      durationMs: 1000,
    };
    receipt.execution = {
      command: "npm run warp:full-solve:nhm2-shift-lapse:selected",
      args: [],
      cwd: "C:/workspace/CasimirBot",
      environment: {},
      outputDirectory: "artifacts/theory-runtime/run-2",
      outputDirectoryBound: true,
      exitCode: 0,
      stdout: "",
      stderr: "",
      timedOut: false,
      error: null,
    };
    receipt.outputs.artifactManifest = buildTheoryRuntimeOutputManifestV1({
      generatedAt: "2026-07-18T12:00:01.000Z",
      requestId: "request:run-2",
      runtimeId: receipt.runtimeId,
      gitSha: receipt.provenance.gitSha,
      startedAt: receipt.provenance.startedAt,
      completedAt: receipt.provenance.completedAt,
      manifestPath: "artifacts/theory-runtime/run-2/manifest.json",
      manifestSha256: "d".repeat(64),
      outputDirectory: "artifacts/theory-runtime/run-2",
      boundToExecution: true,
      entries: receipt.outputs.artifacts.map((path, index) => ({
        path,
        sha256: String(index + 1).repeat(64),
        sizeBytes: 100,
        modifiedAt: "2026-07-18T12:00:00.500Z",
        freshness: index === 0 ? "preexisting" as const : "new" as const,
      })),
    });

    render(<RuntimeReceiptStatusLamps receipt={receipt} />);

    expect(screen.getByTestId("runtime-status-lamp-provenance")).toHaveAttribute("data-status", "preexisting");
    expect(screen.getByTestId("runtime-status-non-override-note")).toHaveTextContent(/runtime provenance preexisting/i);
  });

  it("does not let provenance or formal-certificate gates overwrite artifact evidence", () => {
    const receipt = makeReceipt();
    receipt.outputs.gates = {
      source_closure_artifact: "pass",
      runtime_execution_provenance: "not_ready",
      runtime_artifact_freshness: "not_ready",
      certificate_integrity: "fail",
    };

    render(<RuntimeReceiptStatusLamps receipt={receipt} />);

    expect(screen.getByTestId("runtime-status-lamp-evidence")).toHaveAttribute("data-status", "pass");
    expect(screen.getByTestId("runtime-status-lamp-provenance")).toHaveAttribute("data-status", "unbound");
    expect(screen.getByTestId("runtime-status-lamp-certificate")).toHaveAttribute("data-status", "fail");
  });
});
