import {
  buildHelixAskOperatorSurfaceLayoutParityBrowserRecord,
  buildHelixAskOperatorSurfaceLayoutParityEvidenceFromMeasurements,
  type HelixAskOperatorSurfaceLayoutParityBrowserRecord,
  type HelixAskOperatorSurfaceLayoutParityRect,
  type HelixAskOperatorSurfaceLayoutParityScrollMetrics,
  type HelixAskOperatorSurfaceLayoutParityViewportMeasurement,
} from "./HelixAskOperatorSurfaceLayoutParity";
import { buildHelixAskOperatorSurfaceParityRouteHint } from "./HelixAskOperatorSurfaceParityRoute";

export type HelixAskOperatorSurfaceBrowserCaptureSelectors = {
  legacySurface: string;
  recrownedSurface: string;
  recrownedComposer: string;
  recrownedCompletedTurnLane: string;
  recrownedReplyList: string;
};

export type HelixAskOperatorSurfaceBrowserCaptureResult =
  | {
    status: "captured";
    record: HelixAskOperatorSurfaceLayoutParityBrowserRecord;
    missingSelectors: readonly string[];
  }
  | {
    status: "missing_selectors";
    record: null;
    missingSelectors: readonly string[];
  };

export const HELIX_ASK_OPERATOR_SURFACE_BROWSER_CAPTURE_SELECTORS: HelixAskOperatorSurfaceBrowserCaptureSelectors = {
  legacySurface: '[data-testid="helix-ask-operator-surface-parity-legacy"]',
  recrownedSurface: '[data-testid="helix-ask-operator-surface-parity-recrowned"]',
  recrownedComposer: '[data-testid="helix-ask-operator-surface-parity-recrowned"] textarea',
  recrownedCompletedTurnLane:
    '[data-testid="helix-ask-operator-surface-parity-recrowned"] [data-testid="helix-ask-active-turn-stream-lane"], [data-testid="helix-ask-operator-surface-parity-recrowned"] [data-testid="helix-ask-turn-list-scroll"]',
  recrownedReplyList:
    '[data-testid="helix-ask-operator-surface-parity-recrowned"] [data-testid="helix-ask-turn-list-scroll"]',
};

function rectFromElement(element: Element): HelixAskOperatorSurfaceLayoutParityRect {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    bottom: rect.bottom,
    height: rect.height,
  };
}

function scrollMetricsFromElement(element: Element): HelixAskOperatorSurfaceLayoutParityScrollMetrics {
  return {
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  };
}

function resolveFirstElement(
  documentLike: Pick<Document, "querySelector">,
  selector: string,
): Element | null {
  return documentLike.querySelector(selector);
}

export function captureHelixAskOperatorSurfaceViewportMeasurement(args: {
  document: Pick<Document, "querySelector">;
  viewportWidth: number;
  viewportHeight: number;
  selectors?: Partial<HelixAskOperatorSurfaceBrowserCaptureSelectors>;
}): HelixAskOperatorSurfaceLayoutParityViewportMeasurement | null {
  const selectors = {
    ...HELIX_ASK_OPERATOR_SURFACE_BROWSER_CAPTURE_SELECTORS,
    ...args.selectors,
  };
  const legacySurface = resolveFirstElement(args.document, selectors.legacySurface);
  const recrownedSurface = resolveFirstElement(args.document, selectors.recrownedSurface);
  const recrownedComposer = resolveFirstElement(args.document, selectors.recrownedComposer);
  const recrownedCompletedTurnLane = resolveFirstElement(args.document, selectors.recrownedCompletedTurnLane);
  const recrownedReplyList = resolveFirstElement(args.document, selectors.recrownedReplyList);
  if (
    !legacySurface ||
    !recrownedSurface ||
    !recrownedComposer ||
    !recrownedCompletedTurnLane ||
    !recrownedReplyList
  ) {
    return null;
  }

  return {
    viewportWidth: args.viewportWidth,
    viewportHeight: args.viewportHeight,
    legacySurfaceRect: rectFromElement(legacySurface),
    recrownedSurfaceRect: rectFromElement(recrownedSurface),
    recrownedComposerRect: rectFromElement(recrownedComposer),
    recrownedCompletedTurnLaneRect: rectFromElement(recrownedCompletedTurnLane),
    recrownedReplyListScrollMetrics: scrollMetricsFromElement(recrownedReplyList),
  };
}

export function captureHelixAskOperatorSurfaceBrowserRecord(args: {
  document: Pick<Document, "querySelector">;
  viewportWidth: number;
  viewportHeight: number;
  capturedAtMs: number;
  route?: string;
  oldBridgeScreenshotRef?: string;
  recrownedShellScreenshotRef?: string;
  selectors?: Partial<HelixAskOperatorSurfaceBrowserCaptureSelectors>;
}): HelixAskOperatorSurfaceBrowserCaptureResult {
  const selectors = {
    ...HELIX_ASK_OPERATOR_SURFACE_BROWSER_CAPTURE_SELECTORS,
    ...args.selectors,
  };
  const missingSelectors = Object.values(selectors).filter(
    (selector) => !resolveFirstElement(args.document, selector),
  );
  if (missingSelectors.length > 0) {
    return {
      status: "missing_selectors",
      record: null,
      missingSelectors,
    };
  }

  const measurement = captureHelixAskOperatorSurfaceViewportMeasurement({
    document: args.document,
    viewportWidth: args.viewportWidth,
    viewportHeight: args.viewportHeight,
    selectors,
  });
  if (!measurement) {
    return {
      status: "missing_selectors",
      record: null,
      missingSelectors: Object.values(selectors),
    };
  }

  const evidence = buildHelixAskOperatorSurfaceLayoutParityEvidenceFromMeasurements({
    oldBridgeScreenshotRef: args.oldBridgeScreenshotRef,
    recrownedShellScreenshotRef: args.recrownedShellScreenshotRef,
    desktop: measurement.viewportWidth >= 768 ? measurement : undefined,
    mobile: measurement.viewportWidth < 768 ? measurement : undefined,
  });

  return {
    status: "captured",
    missingSelectors: [],
    record: buildHelixAskOperatorSurfaceLayoutParityBrowserRecord({
      route: args.route ?? buildHelixAskOperatorSurfaceParityRouteHint(),
      capturedAtMs: args.capturedAtMs,
      viewportWidth: args.viewportWidth,
      viewportHeight: args.viewportHeight,
      evidence,
    }),
  };
}
