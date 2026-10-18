import type { HelixAskConsoleOperatorSurfaceParityItem } from "./HelixAskConsoleState";

export type HelixAskOperatorSurfaceLayoutParityEvidence = {
  oldBridgeScreenshotRef?: string;
  recrownedShellScreenshotRef?: string;
  desktopTopOffsetPx?: number;
  mobileTopOffsetPx?: number;
  dockReplyListScrolls?: boolean;
  composerFullyVisible?: boolean;
  completedTurnLaneVisible?: boolean;
};

export type HelixAskOperatorSurfaceLayoutParityRect = {
  top: number;
  bottom: number;
  height: number;
};

export type HelixAskOperatorSurfaceLayoutParityScrollMetrics = {
  clientHeight: number;
  scrollHeight: number;
};

export type HelixAskOperatorSurfaceLayoutParityViewportMeasurement = {
  viewportWidth: number;
  viewportHeight: number;
  legacySurfaceRect: HelixAskOperatorSurfaceLayoutParityRect;
  recrownedSurfaceRect: HelixAskOperatorSurfaceLayoutParityRect;
  recrownedComposerRect: HelixAskOperatorSurfaceLayoutParityRect;
  recrownedCompletedTurnLaneRect: HelixAskOperatorSurfaceLayoutParityRect;
  recrownedReplyListScrollMetrics: HelixAskOperatorSurfaceLayoutParityScrollMetrics;
};

export type HelixAskOperatorSurfaceLayoutParityBrowserRecord = {
  schema: "helix.ask.operator_surface.layout_parity.browser_record.v1";
  route: string;
  capturedAtMs: number;
  viewport: {
    width: number;
    height: number;
    kind: "desktop" | "mobile" | "unknown";
  };
  evidence: HelixAskOperatorSurfaceLayoutParityEvidence;
  readiness: HelixAskOperatorSurfaceLayoutParityReadiness;
};

export type HelixAskOperatorSurfaceLayoutParityEvidencePacket = {
  schema: "helix.ask.operator_surface.layout_parity.evidence_packet.v1";
  records: readonly HelixAskOperatorSurfaceLayoutParityBrowserRecord[];
  mergedEvidence: HelixAskOperatorSurfaceLayoutParityEvidence;
  readiness: HelixAskOperatorSurfaceLayoutParityReadiness;
  desktopRecordCount: number;
  mobileRecordCount: number;
  missingViewportKinds: readonly ("desktop" | "mobile")[];
  ready: boolean;
};

export type HelixAskOperatorSurfaceLayoutParityViewportKind = "desktop" | "mobile" | "unknown";

export type HelixAskOperatorSurfaceLayoutParityCriterion = {
  key: HelixAskConsoleOperatorSurfaceParityItem;
  label: string;
  owner: string;
  requiredEvidence: readonly (keyof HelixAskOperatorSurfaceLayoutParityEvidence)[];
  browserCheck: string;
};

export const HELIX_ASK_OPERATOR_SURFACE_LAYOUT_PARITY_CRITERIA = [
  {
    key: "layout_position_sizing_dock_behavior",
    label: "Layout position, sizing, and dock behavior",
    owner: "HelixAskConsoleRuntimeLayout",
    requiredEvidence: [
      "oldBridgeScreenshotRef",
      "recrownedShellScreenshotRef",
      "dockReplyListScrolls",
      "composerFullyVisible",
      "completedTurnLaneVisible",
    ],
    browserCheck:
      "Compare old bridge and recrowned shell in dock mode; composer, completed turns, and reply-list scrolling must occupy the same visible console lane.",
  },
  {
    key: "top_of_console_readable",
    label: "Top of console remains readable",
    owner: "HelixAskSurfaceFrame",
    requiredEvidence: [
      "oldBridgeScreenshotRef",
      "recrownedShellScreenshotRef",
      "desktopTopOffsetPx",
      "mobileTopOffsetPx",
      "composerFullyVisible",
    ],
    browserCheck:
      "Verify the top of the Ask surface stays readable on desktop and compact/mobile viewports without creeping under the browser/app chrome.",
  },
] as const satisfies readonly HelixAskOperatorSurfaceLayoutParityCriterion[];

export type HelixAskOperatorSurfaceLayoutParityReadiness = {
  ready: boolean;
  openKeys: readonly HelixAskConsoleOperatorSurfaceParityItem[];
  missingEvidence: Partial<Record<HelixAskConsoleOperatorSurfaceParityItem, readonly string[]>>;
};

function hasEvidenceValue(
  evidence: HelixAskOperatorSurfaceLayoutParityEvidence,
  key: keyof HelixAskOperatorSurfaceLayoutParityEvidence,
): boolean {
  const value = evidence[key];
  if (typeof value === "string") return value.trim().length > 0;
  return value !== undefined && value !== null;
}

export function resolveHelixAskOperatorSurfaceLayoutParityReadiness(
  evidence: HelixAskOperatorSurfaceLayoutParityEvidence = {},
): HelixAskOperatorSurfaceLayoutParityReadiness {
  const missingEntries = HELIX_ASK_OPERATOR_SURFACE_LAYOUT_PARITY_CRITERIA.map((criterion) => {
    const missing = criterion.requiredEvidence.filter((key) => !hasEvidenceValue(evidence, key));
    return [criterion.key, missing] as const;
  }).filter(([, missing]) => missing.length > 0);

  return {
    ready: missingEntries.length === 0,
    openKeys: missingEntries.map(([key]) => key),
    missingEvidence: Object.fromEntries(missingEntries) as Partial<Record<
      HelixAskConsoleOperatorSurfaceParityItem,
      readonly string[]
    >>,
  };
}

export function buildHelixAskOperatorSurfaceLayoutParitySummary(
  evidence: HelixAskOperatorSurfaceLayoutParityEvidence = {},
) {
  const readiness = resolveHelixAskOperatorSurfaceLayoutParityReadiness(evidence);
  return {
    criteriaCount: HELIX_ASK_OPERATOR_SURFACE_LAYOUT_PARITY_CRITERIA.length,
    ready: readiness.ready,
    openKeys: readiness.openKeys,
    missingEvidence: readiness.missingEvidence,
  };
}

function isRectVisibleWithinViewport(
  rect: HelixAskOperatorSurfaceLayoutParityRect,
  viewportHeight: number,
): boolean {
  return rect.height > 0 && rect.bottom > 0 && rect.top < viewportHeight;
}

function isRectFullyInsideViewport(
  rect: HelixAskOperatorSurfaceLayoutParityRect,
  viewportHeight: number,
): boolean {
  return rect.height > 0 && rect.top >= 0 && rect.bottom <= viewportHeight;
}

function resolveTopOffsetPx(measurement: HelixAskOperatorSurfaceLayoutParityViewportMeasurement): number {
  return Math.round(Math.min(measurement.legacySurfaceRect.top, measurement.recrownedSurfaceRect.top));
}

export function buildHelixAskOperatorSurfaceLayoutParityEvidenceFromMeasurements(args: {
  oldBridgeScreenshotRef?: string;
  recrownedShellScreenshotRef?: string;
  desktop?: HelixAskOperatorSurfaceLayoutParityViewportMeasurement;
  mobile?: HelixAskOperatorSurfaceLayoutParityViewportMeasurement;
}): HelixAskOperatorSurfaceLayoutParityEvidence {
  const measurements = [args.desktop, args.mobile].filter(
    (measurement): measurement is HelixAskOperatorSurfaceLayoutParityViewportMeasurement => Boolean(measurement),
  );
  const firstMeasurement = measurements[0] ?? null;

  return {
    oldBridgeScreenshotRef: args.oldBridgeScreenshotRef,
    recrownedShellScreenshotRef: args.recrownedShellScreenshotRef,
    desktopTopOffsetPx: args.desktop ? resolveTopOffsetPx(args.desktop) : undefined,
    mobileTopOffsetPx: args.mobile ? resolveTopOffsetPx(args.mobile) : undefined,
    dockReplyListScrolls: firstMeasurement
      ? firstMeasurement.recrownedReplyListScrollMetrics.scrollHeight >
        firstMeasurement.recrownedReplyListScrollMetrics.clientHeight
      : undefined,
    composerFullyVisible:
      measurements.length > 0
        ? measurements.every((measurement) =>
          isRectFullyInsideViewport(measurement.recrownedComposerRect, measurement.viewportHeight),
        )
        : undefined,
    completedTurnLaneVisible:
      measurements.length > 0
        ? measurements.every((measurement) =>
          isRectVisibleWithinViewport(measurement.recrownedCompletedTurnLaneRect, measurement.viewportHeight),
        )
        : undefined,
  };
}

function mergeBooleanEvidence(values: readonly (boolean | undefined)[]): boolean | undefined {
  const definedValues = values.filter((value): value is boolean => typeof value === "boolean");
  if (definedValues.length === 0) return undefined;
  return definedValues.every(Boolean);
}

export function mergeHelixAskOperatorSurfaceLayoutParityEvidence(
  records: readonly HelixAskOperatorSurfaceLayoutParityBrowserRecord[],
): HelixAskOperatorSurfaceLayoutParityEvidence {
  const evidenceList = records.map((record) => record.evidence);
  return {
    oldBridgeScreenshotRef:
      evidenceList.find((evidence) => evidence.oldBridgeScreenshotRef)?.oldBridgeScreenshotRef,
    recrownedShellScreenshotRef:
      evidenceList.find((evidence) => evidence.recrownedShellScreenshotRef)?.recrownedShellScreenshotRef,
    desktopTopOffsetPx:
      evidenceList.find((evidence) => typeof evidence.desktopTopOffsetPx === "number")?.desktopTopOffsetPx,
    mobileTopOffsetPx:
      evidenceList.find((evidence) => typeof evidence.mobileTopOffsetPx === "number")?.mobileTopOffsetPx,
    dockReplyListScrolls: mergeBooleanEvidence(evidenceList.map((evidence) => evidence.dockReplyListScrolls)),
    composerFullyVisible: mergeBooleanEvidence(evidenceList.map((evidence) => evidence.composerFullyVisible)),
    completedTurnLaneVisible: mergeBooleanEvidence(
      evidenceList.map((evidence) => evidence.completedTurnLaneVisible),
    ),
  };
}

export function buildHelixAskOperatorSurfaceLayoutParityEvidencePacket(
  records: readonly HelixAskOperatorSurfaceLayoutParityBrowserRecord[],
): HelixAskOperatorSurfaceLayoutParityEvidencePacket {
  const mergedEvidence = mergeHelixAskOperatorSurfaceLayoutParityEvidence(records);
  const readiness = resolveHelixAskOperatorSurfaceLayoutParityReadiness(mergedEvidence);
  const desktopRecordCount = records.filter((record) => record.viewport.kind === "desktop").length;
  const mobileRecordCount = records.filter((record) => record.viewport.kind === "mobile").length;
  const missingViewportKinds = [
    desktopRecordCount > 0 ? null : "desktop",
    mobileRecordCount > 0 ? null : "mobile",
  ].filter((kind): kind is "desktop" | "mobile" => Boolean(kind));

  return {
    schema: "helix.ask.operator_surface.layout_parity.evidence_packet.v1",
    records,
    mergedEvidence,
    readiness,
    desktopRecordCount,
    mobileRecordCount,
    missingViewportKinds,
    ready: readiness.ready && missingViewportKinds.length === 0,
  };
}

export function upsertHelixAskOperatorSurfaceLayoutParityBrowserRecord(
  records: readonly HelixAskOperatorSurfaceLayoutParityBrowserRecord[],
  record: HelixAskOperatorSurfaceLayoutParityBrowserRecord,
): readonly HelixAskOperatorSurfaceLayoutParityBrowserRecord[] {
  if (record.viewport.kind === "unknown") return records;
  const withoutSameViewport = records.filter((existing) => existing.viewport.kind !== record.viewport.kind);
  return [...withoutSameViewport, record].sort((left, right) => {
    const leftRank = left.viewport.kind === "desktop" ? 0 : 1;
    const rightRank = right.viewport.kind === "desktop" ? 0 : 1;
    return leftRank - rightRank;
  });
}

export function resolveHelixAskOperatorSurfaceLayoutParityViewportKind(args: {
  width?: number | null;
  height?: number | null;
}): HelixAskOperatorSurfaceLayoutParityViewportKind {
  const width = typeof args.width === "number" ? args.width : null;
  const height = typeof args.height === "number" ? args.height : null;
  if (!width || !height || width <= 0 || height <= 0) return "unknown";
  return width < 768 ? "mobile" : "desktop";
}

export function buildHelixAskOperatorSurfaceLayoutParityBrowserRecord(args: {
  route: string;
  capturedAtMs: number;
  viewportWidth: number;
  viewportHeight: number;
  evidence?: HelixAskOperatorSurfaceLayoutParityEvidence;
}): HelixAskOperatorSurfaceLayoutParityBrowserRecord {
  const evidence = args.evidence ?? {};
  return {
    schema: "helix.ask.operator_surface.layout_parity.browser_record.v1",
    route: args.route,
    capturedAtMs: args.capturedAtMs,
    viewport: {
      width: args.viewportWidth,
      height: args.viewportHeight,
      kind: resolveHelixAskOperatorSurfaceLayoutParityViewportKind({
        width: args.viewportWidth,
        height: args.viewportHeight,
      }),
    },
    evidence,
    readiness: resolveHelixAskOperatorSurfaceLayoutParityReadiness(evidence),
  };
}
