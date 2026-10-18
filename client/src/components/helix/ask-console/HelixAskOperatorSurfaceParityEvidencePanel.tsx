import React from "react";

import {
  buildHelixAskOperatorSurfaceParityChecklistSummary,
  selectHelixAskOperatorSurfaceParityChecklistByStatus,
} from "./HelixAskOperatorSurfaceParityChecklist";
import {
  buildHelixAskOperatorSurfaceLayoutParityEvidencePacket,
  buildHelixAskOperatorSurfaceLayoutParityBrowserRecord,
  buildHelixAskOperatorSurfaceLayoutParitySummary,
  upsertHelixAskOperatorSurfaceLayoutParityBrowserRecord,
  type HelixAskOperatorSurfaceLayoutParityBrowserRecord,
  type HelixAskOperatorSurfaceLayoutParityEvidencePacket,
} from "./HelixAskOperatorSurfaceLayoutParity";
import {
  buildHelixAskOperatorSurfaceParityRouteHint,
} from "./HelixAskOperatorSurfaceParityRoute";
import {
  captureHelixAskOperatorSurfaceBrowserRecord,
  type HelixAskOperatorSurfaceBrowserCaptureResult,
} from "./HelixAskOperatorSurfaceBrowserCapture";

export type HelixAskOperatorSurfaceParityEvidencePanelProps = {
  routeSearch?: string;
};

export const HELIX_ASK_OPERATOR_SURFACE_PARITY_EVIDENCE_STORAGE_KEY =
  "helixAskOperatorSurfaceParityEvidenceRecords:v1";

function isHelixAskOperatorSurfaceLayoutParityBrowserRecord(
  value: unknown,
): value is HelixAskOperatorSurfaceLayoutParityBrowserRecord {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { schema?: unknown }).schema === "helix.ask.operator_surface.layout_parity.browser_record.v1",
  );
}

function readStoredHelixAskOperatorSurfaceLayoutParityBrowserRecords(
  storage: Pick<Storage, "getItem">,
): readonly HelixAskOperatorSurfaceLayoutParityBrowserRecord[] {
  const rawValue = storage.getItem(HELIX_ASK_OPERATOR_SURFACE_PARITY_EVIDENCE_STORAGE_KEY);
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHelixAskOperatorSurfaceLayoutParityBrowserRecord);
  } catch {
    return [];
  }
}

function writeStoredHelixAskOperatorSurfaceLayoutParityBrowserRecords(
  storage: Pick<Storage, "setItem">,
  records: readonly HelixAskOperatorSurfaceLayoutParityBrowserRecord[],
) {
  storage.setItem(HELIX_ASK_OPERATOR_SURFACE_PARITY_EVIDENCE_STORAGE_KEY, JSON.stringify(records));
}

export function HelixAskOperatorSurfaceParityEvidencePanel({
  routeSearch,
}: HelixAskOperatorSurfaceParityEvidencePanelProps) {
  const checklistSummary = buildHelixAskOperatorSurfaceParityChecklistSummary();
  const layoutSummary = buildHelixAskOperatorSurfaceLayoutParitySummary();
  const openItems = selectHelixAskOperatorSurfaceParityChecklistByStatus("open");
  const routeHint = buildHelixAskOperatorSurfaceParityRouteHint();
  const activeRoute = routeSearch && routeSearch.includes(routeHint.slice(1));
  const [captureResult, setCaptureResult] =
    React.useState<HelixAskOperatorSurfaceBrowserCaptureResult | null>(null);
  const [evidencePacket, setEvidencePacket] =
    React.useState<HelixAskOperatorSurfaceLayoutParityEvidencePacket>(() =>
      buildHelixAskOperatorSurfaceLayoutParityEvidencePacket([]),
    );
  const capturedRecord = captureResult?.status === "captured" ? captureResult.record : null;
  const capturedReadiness = capturedRecord?.readiness ?? null;
  const capturedEvidence = capturedRecord?.evidence ?? null;
  const capturedRecordJson = capturedRecord ? JSON.stringify(capturedRecord) : "";
  const evidencePacketJson = JSON.stringify(evidencePacket);
  const evidenceRecord = buildHelixAskOperatorSurfaceLayoutParityBrowserRecord({
    route: routeHint,
    capturedAtMs: 0,
    viewportWidth: 0,
    viewportHeight: 0,
  });

  React.useEffect(() => {
    if (!activeRoute || typeof document === "undefined" || typeof window === "undefined") {
      setCaptureResult(null);
      setEvidencePacket(buildHelixAskOperatorSurfaceLayoutParityEvidencePacket([]));
      return;
    }
    const nextCaptureResult = captureHelixAskOperatorSurfaceBrowserRecord({
      document,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      capturedAtMs: Date.now(),
      route: routeHint,
    });
    setCaptureResult(nextCaptureResult);
    if (nextCaptureResult.status !== "captured" || typeof window.sessionStorage === "undefined") {
      setEvidencePacket(buildHelixAskOperatorSurfaceLayoutParityEvidencePacket([]));
      return;
    }
    const storedRecords = readStoredHelixAskOperatorSurfaceLayoutParityBrowserRecords(window.sessionStorage);
    const nextRecords = upsertHelixAskOperatorSurfaceLayoutParityBrowserRecord(
      storedRecords,
      nextCaptureResult.record,
    );
    writeStoredHelixAskOperatorSurfaceLayoutParityBrowserRecords(window.sessionStorage, nextRecords);
    setEvidencePacket(buildHelixAskOperatorSurfaceLayoutParityEvidencePacket(nextRecords));
  }, [activeRoute, routeHint]);

  return (
    <aside
      className="rounded-lg border border-cyan-200/20 bg-slate-950/90 p-3 text-cyan-50 shadow-xl"
      data-testid="helix-ask-operator-surface-parity-evidence"
      data-parity-ready={String(checklistSummary.ready && layoutSummary.ready)}
      data-open-gate-count={String(checklistSummary.openCount)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-100/60">
            Operator surface parity
          </p>
          <p className="mt-1 text-sm text-cyan-50">
            {checklistSummary.provenCount} proven, {checklistSummary.openCount} open before default flip
          </p>
        </div>
        <code className="rounded border border-cyan-100/20 bg-cyan-950/40 px-2 py-1 text-[11px] text-cyan-100">
          {routeHint}
        </code>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {openItems.map((item) => {
          const missingEvidence = layoutSummary.missingEvidence[item.key] ?? [];
          return (
            <div
              key={item.key}
              className="rounded-md border border-cyan-100/15 bg-cyan-950/25 p-2"
              data-testid={`helix-ask-operator-surface-parity-open-${item.key}`}
            >
              <p className="text-xs font-semibold text-cyan-50">{item.label}</p>
              <p className="mt-1 text-[11px] text-cyan-100/70">{item.evidence}</p>
              {missingEvidence.length > 0 ? (
                <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-amber-100/80">
                  Missing: {missingEvidence.join(", ")}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-cyan-100/60" data-active-parity-route={String(Boolean(activeRoute))}>
        Default remains the legacy bridge until browser evidence closes these gates.
      </p>
      <p
        className="mt-2 font-mono text-[10px] text-cyan-100/45"
        data-testid="helix-ask-operator-surface-parity-record-schema"
      >
        Evidence record: {evidenceRecord.schema}
      </p>
      <p
        className="mt-1 font-mono text-[10px] text-cyan-100/45"
        data-testid="helix-ask-operator-surface-parity-capture-status"
        data-capture-status={captureResult?.status ?? "waiting_for_browser_measurement"}
        data-missing-selector-count={String(captureResult?.missingSelectors.length ?? 0)}
        data-record-ready={capturedReadiness ? String(capturedReadiness.ready) : "unknown"}
        data-viewport-kind={capturedRecord?.viewport.kind ?? "unknown"}
        data-open-keys={capturedReadiness?.openKeys.join(",") ?? ""}
        data-desktop-top-offset-px={String(capturedEvidence?.desktopTopOffsetPx ?? "")}
        data-mobile-top-offset-px={String(capturedEvidence?.mobileTopOffsetPx ?? "")}
      >
        Browser capture: {captureResult?.status ?? "waiting for browser measurement"}
      </p>
      <p
        className="mt-1 font-mono text-[10px] text-cyan-100/45"
        data-testid="helix-ask-operator-surface-parity-evidence-packet-status"
        data-packet-ready={String(evidencePacket.ready)}
        data-desktop-record-count={String(evidencePacket.desktopRecordCount)}
        data-mobile-record-count={String(evidencePacket.mobileRecordCount)}
        data-missing-viewport-kinds={evidencePacket.missingViewportKinds.join(",")}
        data-packet-open-keys={evidencePacket.readiness.openKeys.join(",")}
      >
        Evidence packet: {evidencePacket.ready ? "ready" : "waiting for desktop and mobile captures"}
      </p>
      {captureResult?.status === "missing_selectors" && captureResult.missingSelectors.length > 0 ? (
        <p
          className="mt-1 font-mono text-[10px] text-amber-100/70"
          data-testid="helix-ask-operator-surface-parity-missing-selectors"
        >
          Missing selectors: {captureResult.missingSelectors.join(" | ")}
        </p>
      ) : null}
      <output
        className="sr-only"
        data-testid="helix-ask-operator-surface-parity-capture-record"
        data-record-schema={capturedRecord?.schema ?? evidenceRecord.schema}
        data-record-json={capturedRecordJson}
      >
        {capturedRecordJson}
      </output>
      <output
        className="sr-only"
        data-testid="helix-ask-operator-surface-parity-evidence-packet"
        data-packet-schema={evidencePacket.schema}
        data-packet-json={evidencePacketJson}
      >
        {evidencePacketJson}
      </output>
    </aside>
  );
}
