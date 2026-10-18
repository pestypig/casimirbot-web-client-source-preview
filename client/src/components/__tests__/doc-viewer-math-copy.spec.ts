/**
 * @vitest-environment jsdom
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  dispatchScientificCalculatorMathPicked,
  type ScientificCalculatorMathPickedDetail
} from "@/lib/scientific-calculator/events";
import type { DocumentLiveTranslationProjectionSnapshotSummary } from "@/lib/docs/liveTranslationProjectionRegistry";

let handleDocMathPick: typeof import("@/components/DocViewerPanel").handleDocMathPick;
let applyDocNarratorSourceIds: typeof import("@/components/DocViewerPanel").applyDocNarratorSourceIds;
let getDocumentTranslationStatusLabel: typeof import("@/components/DocViewerPanel").getDocumentTranslationStatusLabel;
let renderDocumentMarkdownToHtml: typeof import("@/components/DocViewerPanel").renderDocumentMarkdownToHtml;

beforeAll(async () => {
  (globalThis as Record<string, unknown>).__HELIX_ASK_JOB_TIMEOUT_MS__ = "1200000";
  ({ applyDocNarratorSourceIds, getDocumentTranslationStatusLabel, handleDocMathPick, renderDocumentMarkdownToHtml } = await import("@/components/DocViewerPanel"));
});

describe("doc viewer math interaction", () => {
  const translate = (id: string, values?: Record<string, unknown>) =>
    values ? `${id}:${JSON.stringify(values)}` : id;

  const emptyProjectionSummary = (
    overrides: Partial<DocumentLiveTranslationProjectionSnapshotSummary> = {},
  ): DocumentLiveTranslationProjectionSnapshotSummary => ({
    version: 0,
    totalCount: 0,
    pendingCount: 0,
    readyCount: 0,
    errorCount: 0,
    healthStatus: "empty",
    displayStatus: "empty",
    hasRenderableText: false,
    hasProjectionErrors: false,
    projectedCount: 0,
    staleCount: 0,
    cancelledCount: 0,
    failedCount: 0,
    latestStatus: null,
    latestObservedAtMs: null,
    latestSourceEventId: null,
    latestSourceEventMs: null,
    latestObservationRef: null,
    latestReceiptRef: null,
    latestLaneSessionId: null,
    latestObservationLaneSessionId: null,
    latestGoalBindingIdFromProjection: null,
    latestEventId: null,
    latestHasObservation: false,
    latestSelectedBackendProvider: null,
    latestChunkId: null,
    latestChunkIndex: null,
    latestDedupeKey: null,
    latestSource: null,
    latestSourceId: null,
    latestSourceHash: null,
    latestSourceKind: null,
    latestSourceTextHash: null,
    latestSourceTextCharCount: null,
    latestProjectionKey: null,
    latestServerProjectionKey: null,
    latestProjectionTarget: null,
    latestAccountLocale: null,
    latestTargetLanguage: null,
    latestProjectionStatus: null,
    latestFreshnessStatus: null,
    latestTerminalAuthorityStatus: "not_terminal_authority",
    latestCancelRequested: false,
    latestError: null,
    suppressedReceiptCount: 0,
    latestSuppressedObservationRef: null,
    latestSuppressedReceiptRef: null,
    latestSuppressedObservationLaneSessionId: null,
    latestSuppressedGoalBindingId: null,
    latestSuppressedEventId: null,
    latestSuppressedHasObservation: false,
    latestSuppressedSelectedBackendProvider: null,
    latestSuppressedProjectionStatus: null,
    latestSuppressedChunkId: null,
    latestSuppressedChunkIndex: null,
    latestSuppressedDedupeKey: null,
    latestSuppressedSourceEventId: null,
    latestSuppressedSourceEventMs: null,
    latestSuppressedObservedAtMs: null,
    latestSuppressedFreshnessStatus: null,
    latestSuppressedDisplayStatus: null,
    latestSuppressedTerminalAuthorityStatus: "not_terminal_authority",
    latestSuppressedSourceId: null,
    latestSuppressedSourceHash: null,
    latestSuppressedSourceKind: null,
    latestSuppressedSourceTextHash: null,
    latestSuppressedSourceTextCharCount: null,
    latestSuppressedProjectionKey: null,
    latestSuppressedServerProjectionKey: null,
    latestSuppressedAccountLocale: null,
    latestSuppressedProjectionTarget: null,
    latestSuppressedTargetLanguage: null,
    latestSuppressedCancelRequested: false,
    latestSuppressedReason: null,
    laneSessionCount: 0,
    activeLaneSessionCount: 0,
    observedLaneSessionCount: 0,
    pausedLaneSessionCount: 0,
    stoppedLaneSessionCount: 0,
    blockedLaneSessionCount: 0,
    latestLaneSessionStatus: null,
    latestLaneSessionHealth: null,
    latestLaneSessionLifecycleAction: null,
    latestLaneSessionPermissionProfile: null,
    latestLaneSessionUpdatedAtMs: null,
    latestLaneSessionEventId: null,
    latestLaneSessionControlKey: null,
    latestLaneSessionHasObservation: false,
    latestLaneSessionSourceId: null,
    latestLaneSessionSourceHash: null,
    latestLaneSessionSourceKind: null,
    latestLaneSessionSourceTextHash: null,
    latestLaneSessionSourceTextCharCount: null,
    latestLaneSessionProjectionTarget: null,
    latestLaneSessionAccountLocale: null,
    latestLaneSessionTargetLanguage: null,
    latestLaneSessionChunkId: null,
    latestLaneSessionChunkIndex: null,
    latestLaneSessionDedupeKey: null,
    latestLaneSessionSourceEventId: null,
    latestLaneSessionSourceEventMs: null,
    latestLaneSessionObservedAtMs: null,
    latestLaneSessionFreshnessStatus: null,
    latestLaneSessionTerminalAuthorityStatus: "not_terminal_authority",
    mailLoopCount: 0,
    pendingMailLoopCount: 0,
    observedMailLoopCount: 0,
    blockedMailLoopCount: 0,
    latestMailLoopStatus: null,
    latestMailLoopId: null,
    latestMailLoopDeliveryStatus: null,
    latestPreviousStagePlayMailId: null,
    latestMailLoopWakeKind: "none",
    latestMailLoopObservationLaneSessionId: null,
    latestMailLoopSessionControlKey: null,
    latestMailLoopTerminalAuthorityStatus: "not_terminal_authority",
    goalBindingCount: 0,
    activeGoalBindingCount: 0,
    observedGoalBindingCount: 0,
    blockedGoalBindingCount: 0,
    latestGoalBindingId: null,
    latestGoalId: null,
    latestGoalBindingLaneSessionId: null,
    latestGoalBindingStatus: null,
    latestGoalBindingSessionStatus: null,
    latestGoalBindingSessionHealth: null,
    latestGoalBindingActivationPolicy: null,
    latestGoalBindingAttentionPolicy: null,
    latestGoalBindingStopCondition: null,
    latestGoalBindingReportPolicy: null,
    latestGoalBindingQuietBehavior: null,
    latestGoalBindingReportAction: null,
    latestGoalBindingReportReason: null,
    latestGoalBindingObservationRef: null,
    latestGoalBindingReceiptRef: null,
    latestGoalBindingEventId: null,
    latestGoalBindingHasObservation: false,
    latestGoalBindingTerminalAuthorityStatus: "not_terminal_authority",
    latestGoalBindingSourceId: null,
    latestGoalBindingSourceHash: null,
    latestGoalBindingSourceKind: null,
    latestGoalBindingProjectionTarget: null,
    latestGoalBindingAccountLocale: null,
    latestGoalBindingTargetLanguage: null,
    latestGoalBindingChunkId: null,
    latestGoalBindingChunkIndex: null,
    latestGoalBindingDedupeKey: null,
    observedLaneActivityCount: 0,
    terminalEligible: false,
    assistantAnswer: false,
    rawContentIncluded: false,
    ...overrides,
  });

  it("dispatches scientific calculator ingest event and copies latex", () => {
    const clipboardWrite = vi.fn(async () => undefined);
    const events: ScientificCalculatorMathPickedDetail[] = [];
    const dispatch = vi.fn((detail: { latex: string; sourcePath: string | null; anchor: string | null }) => {
      events.push(
        dispatchScientificCalculatorMathPicked({
          latex: detail.latex,
          sourcePath: detail.sourcePath,
          anchor: detail.anchor,
        }),
      );
    });

    handleDocMathPick({
      latex: "x^2-4=0",
      currentPath: "/docs/research/sample.md",
      anchor: "eq-1",
      clipboardWrite,
      dispatchEvent: dispatch,
    });

    expect(clipboardWrite).toHaveBeenCalledWith("x^2-4=0");
    expect(dispatch).toHaveBeenCalledOnce();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      latex: "x^2-4=0",
      sourcePath: "/docs/research/sample.md",
      anchor: "eq-1",
    });
  });

  it("renders a visible calculator sidecar for equations without a specialized manifest action", () => {
    const html = renderDocumentMarkdownToHtml("\\[x^2 + y^2 = z^2\\]", "docs/example/generic-equation.md");
    document.body.innerHTML = html;

    const equation = document.querySelector<HTMLElement>("[data-doc-math-latex]");
    const sidecar = document.querySelector<HTMLElement>("[data-doc-calculator-ingest='true']");
    expect(equation?.dataset.docMathLatex).toBe("x^2 + y^2 = z^2");
    expect(sidecar?.textContent).toBe("C");
    expect(sidecar?.getAttribute("title")).toMatch(/Scientific Calculator/i);
  });

  it("renders runtime sidecars for exact executable registry IDs in inline code", () => {
    const html = renderDocumentMarkdownToHtml(
      "Use `solar.pipeline`, `casimir.verify`, or `nhm2.shift_lapse.alpha_sweep`. Keep `runtimeId` and `warp.full_solve.campaign` inert.",
      "docs/theory-runtime-entrypoints.md",
    );
    document.body.innerHTML = html;

    const sidecars = Array.from(document.querySelectorAll<HTMLElement>("[data-doc-runtime-command-id]"));
    expect(sidecars.map((sidecar) => sidecar.dataset.docRuntimeCommandId)).toEqual([
      "solar.pipeline",
      "casimir.verify",
      "nhm2.shift_lapse.alpha_sweep",
    ]);
    expect(document.querySelector("[data-doc-runtime-id='casimir.verify']")?.getAttribute("data-doc-runtime-command"))
      .toBe("npm run casimir:verify");
    expect(document.querySelector("[data-doc-runtime-id='warp.full_solve.campaign']")).toBeNull();
  });

  it("adds stable narrator source ids to rendered document text blocks", () => {
    document.body.innerHTML = `
      <div>
        <article>
          <h1>Readable heading</h1>
          <p>First readable sentence. Second readable sentence.</p>
          <div class="doc-math-clickable doc-math-clickable-display" role="button" title="Copy LaTeX">
            <span>Equation display</span>
          </div>
        </article>
      </div>
    `;

    const count = applyDocNarratorSourceIds(document.body, "docs/example/readme.md");
    const paragraph = document.querySelector("p");
    const heading = document.querySelector("h1");
    const equation = document.querySelector(".doc-math-clickable-display");

    expect(count).toBe(2);
    expect(heading?.getAttribute("data-narrator-source-id")).toBe("docs-viewer:docs-example-readme-md:h1:0");
    expect(paragraph?.getAttribute("data-narrator-source-id")).toBe("docs-viewer:docs-example-readme-md:p:1");
    expect(equation?.getAttribute("data-narrator-source-id")).toBeNull();
  });

  it("shows lane session and projection health as non-authoritative translation status", () => {
    expect(getDocumentTranslationStatusLabel({
      translationStatus: "idle",
      translationError: null,
      liveTranslationProjectionSummary: emptyProjectionSummary(),
      t: translate,
    })).toBeNull();

    expect(getDocumentTranslationStatusLabel({
      translationStatus: "idle",
      translationError: null,
      liveTranslationProjectionSummary: emptyProjectionSummary({
        laneSessionCount: 1,
        activeLaneSessionCount: 1,
        latestLaneSessionStatus: "running",
        latestLaneSessionHealth: "degraded",
      }),
      t: translate,
    })).toBe('docsViewer.translation.status.sessionActive:{"status":"running / degraded"}');

    expect(getDocumentTranslationStatusLabel({
      translationStatus: "cached",
      translationError: null,
      liveTranslationProjectionSummary: emptyProjectionSummary({
        laneSessionCount: 1,
        activeLaneSessionCount: 1,
        latestLaneSessionStatus: "paused",
        latestLaneSessionHealth: "healthy",
      }),
      t: translate,
    })).toBe('docsViewer.translation.status.sessionPaused:{"status":"paused / healthy"}');

    expect(getDocumentTranslationStatusLabel({
      translationStatus: "idle",
      translationError: null,
      liveTranslationProjectionSummary: emptyProjectionSummary({
        goalBindingCount: 1,
        activeGoalBindingCount: 1,
        latestGoalBindingStatus: "active",
      }),
      t: translate,
    })).toBe('docsViewer.translation.status.goalBindingActive:{"status":"active"}');

    expect(getDocumentTranslationStatusLabel({
      translationStatus: "idle",
      translationError: null,
      liveTranslationProjectionSummary: emptyProjectionSummary({
        mailLoopCount: 1,
        pendingMailLoopCount: 1,
        latestMailLoopStatus: "queued",
      }),
      t: translate,
    })).toBe('docsViewer.translation.status.mailLoopPending:{"status":"queued"}');

    expect(getDocumentTranslationStatusLabel({
      translationStatus: "ready",
      translationError: null,
      liveTranslationProjectionSummary: emptyProjectionSummary({
        laneSessionCount: 1,
        blockedLaneSessionCount: 1,
        latestLaneSessionStatus: "permission_blocked",
        latestLaneSessionHealth: "blocked",
      }),
      t: translate,
    })).toBe('docsViewer.translation.status.sessionBlocked:{"status":"permission_blocked / blocked"}');

    expect(getDocumentTranslationStatusLabel({
      translationStatus: "ready",
      translationError: null,
      liveTranslationProjectionSummary: emptyProjectionSummary({
        goalBindingCount: 1,
        blockedGoalBindingCount: 1,
        latestGoalBindingStatus: "goal_paused",
      }),
      t: translate,
    })).toBe('docsViewer.translation.status.goalBindingBlocked:{"status":"goal_paused"}');

    expect(getDocumentTranslationStatusLabel({
      translationStatus: "idle",
      translationError: null,
      liveTranslationProjectionSummary: emptyProjectionSummary({
        totalCount: 1,
        errorCount: 1,
        failedCount: 1,
        hasProjectionErrors: true,
        latestProjectionStatus: "failed",
        latestError: "backend_unconfigured",
      }),
      t: translate,
    })).toBe('docsViewer.translation.status.projectionFailed:{"reason":"backend_unconfigured"}');

    expect(getDocumentTranslationStatusLabel({
      translationStatus: "idle",
      translationError: null,
      liveTranslationProjectionSummary: emptyProjectionSummary({
        totalCount: 1,
        errorCount: 1,
        cancelledCount: 1,
        latestProjectionStatus: "cancelled",
      }),
      t: translate,
    })).toBe('docsViewer.translation.status.projectionCancelled:{"status":"cancelled"}');

    expect(getDocumentTranslationStatusLabel({
      translationStatus: "idle",
      translationError: null,
      liveTranslationProjectionSummary: emptyProjectionSummary({
        totalCount: 1,
        errorCount: 1,
        staleCount: 1,
        latestProjectionStatus: "stale",
        latestFreshnessStatus: "stale_source",
      }),
      t: translate,
    })).toBe('docsViewer.translation.status.projectionStale:{"status":"stale_source"}');

    expect(getDocumentTranslationStatusLabel({
      translationStatus: "idle",
      translationError: null,
      liveTranslationProjectionSummary: emptyProjectionSummary({
        totalCount: 1,
        pendingCount: 1,
        healthStatus: "pending",
        latestProjectionStatus: "queued",
      }),
      t: translate,
    })).toBe('docsViewer.translation.status.projectionPending:{"status":"queued"}');

    expect(getDocumentTranslationStatusLabel({
      translationStatus: "idle",
      translationError: null,
      liveTranslationProjectionSummary: emptyProjectionSummary({
        totalCount: 1,
        readyCount: 1,
        healthStatus: "ready",
        hasRenderableText: true,
        projectedCount: 1,
        latestProjectionStatus: "projected",
      }),
      t: translate,
    })).toBe('docsViewer.translation.status.ready:{"status":"projected"}');

    expect(getDocumentTranslationStatusLabel({
      translationStatus: "ready",
      translationError: null,
      liveTranslationProjectionSummary: emptyProjectionSummary({
        totalCount: 1,
        readyCount: 1,
        healthStatus: "ready",
        hasRenderableText: true,
        projectedCount: 1,
        latestProjectionStatus: "projected",
      }),
      t: translate,
    })).toBe('docsViewer.translation.status.ready:{"status":"projected"}');

    expect(getDocumentTranslationStatusLabel({
      translationStatus: "cached",
      translationError: null,
      liveTranslationProjectionSummary: emptyProjectionSummary({
        totalCount: 2,
        readyCount: 1,
        errorCount: 1,
        healthStatus: "degraded",
        hasRenderableText: true,
        hasProjectionErrors: true,
        projectedCount: 1,
        failedCount: 1,
        latestProjectionStatus: "failed",
      }),
      t: translate,
    })).toBe('docsViewer.translation.status.projectionDegraded:{"status":"failed"}');

    expect(getDocumentTranslationStatusLabel({
      translationStatus: "ready",
      translationError: null,
      liveTranslationProjectionSummary: emptyProjectionSummary({
        totalCount: 2,
        readyCount: 1,
        errorCount: 1,
        healthStatus: "degraded",
        hasRenderableText: true,
        hasProjectionErrors: true,
        projectedCount: 1,
        failedCount: 1,
        latestSuppressedDisplayStatus: "failed",
        latestProjectionStatus: "projected",
      }),
      t: translate,
    })).toBe('docsViewer.translation.status.projectionDegraded:{"status":"failed"}');
  });

  it("routes inline document translation through Stage Play document Markdown mail", () => {
    const panelSource = readFileSync(join(process.cwd(), "client/src/components/DocViewerPanel.tsx"), "utf8");
    const clientSource = readFileSync(join(process.cwd(), "client/src/lib/docs/documentTranslationClient.ts"), "utf8");
    const agiApiSource = readFileSync(join(process.cwd(), "client/src/lib/agi/api.ts"), "utf8");
    const stagePlayRouteSource = readFileSync(join(process.cwd(), "server/routes/helix/stage-play.ts"), "utf8");
    const sourceMessagesSource = readFileSync(join(process.cwd(), "client/src/lib/i18n/messages/source.ts"), "utf8");
    const hawMessagesSource = readFileSync(join(process.cwd(), "client/src/lib/i18n/messages/haw.ts"), "utf8");

    expect(panelSource).toContain("enqueueDocumentMarkdownTranslationMail");
    expect(panelSource).toContain("runDocumentMarkdownTranslationLaneSessionControl");
    expect(panelSource).toContain("emitDocumentTranslationLaneSessionControlEvents");
    expect(panelSource).toContain("documentInlineTranslationLaneSessionId(activeTranslationScopeKey)");
    expect(panelSource).toContain("const laneSessionId = documentInlineTranslationLaneSessionId(scopeKey)");
    expect(panelSource).toContain("laneSessionId,");
    expect(panelSource).toContain("runLaneSessionControl(\"start\")");
    expect(panelSource).toContain("runLaneSessionControl(\"stop\")");
    expect(panelSource).toContain("readDocumentMarkdownMicroDeckRuns");
    expect(panelSource).toContain("extractDocumentMarkdownTranslationsFromRuns");
    expect(panelSource).toContain("subscribeDocumentLiveTranslationProjectionRegistry");
    expect(panelSource).toContain("readDocumentLiveTranslationProjectionSnapshot");
    expect(panelSource).toContain("summarizeDocumentLiveTranslationProjectionSnapshot");
    expect(panelSource).toContain("installDocumentLiveTranslationProjectionEventIngestion");
    expect(panelSource).toContain("const liveTranslationProjectionEligible =");
    expect(panelSource).toContain("sourceHash: rawMarkdownSourceHash");
    expect(panelSource).toContain("allowStaleDisplayText: inlineTranslationEnabled");
    const eventIngestionInstall = panelSource.match(
      /installDocumentLiveTranslationProjectionEventIngestion\(\{[\s\S]*?\n    \}\);/,
    )?.[0] ?? "";
    expect(panelSource).toContain("if (!activeDocument || !liveTranslationProjectionEligible) return;");
    expect(panelSource).not.toContain("if (!currentEntry || !translationEligible || translationUnits.length === 0) return;");
    expect(eventIngestionInstall).toContain("sourceHash: rawMarkdownSourceHash");
    expect(eventIngestionInstall).not.toContain("sourceTextHash: rawMarkdownSourceHash");
    expect(eventIngestionInstall).not.toContain("sourceTextCharCount: rawMarkdown.length");
    expect(panelSource).toContain("liveTranslationProjectionSnapshot.translations");
    expect(panelSource).toContain("liveTranslationProjectionSummary");
    expect(panelSource).toContain("docsViewer.translation.status.sessionActive");
    expect(panelSource).toContain("docsViewer.translation.status.sessionPaused");
    expect(panelSource).toContain("docsViewer.translation.status.sessionBlocked");
    expect(panelSource).toContain("docsViewer.translation.status.mailLoopBlocked");
    expect(panelSource).toContain("docsViewer.translation.status.mailLoopPending");
    expect(panelSource).toContain("docsViewer.translation.status.goalBindingActive");
    expect(panelSource).toContain("docsViewer.translation.status.goalBindingBlocked");
    expect(panelSource).toContain("docsViewer.translation.status.projectionPending");
    expect(panelSource).toContain("docsViewer.translation.status.projectionFailed");
    expect(panelSource).toContain("docsViewer.translation.status.projectionCancelled");
    expect(panelSource).toContain("docsViewer.translation.status.projectionStale");
    expect(panelSource).toContain("docsViewer.translation.status.projectionDegraded");
    expect(sourceMessagesSource).toContain("not Ask answer authority");
    expect(sourceMessagesSource).toContain("Translation projections appear under visible source text");
    expect(hawMessagesSource).toContain("mana pane Ask");
    expect(hawMessagesSource).toContain("docsViewer.translation.status.projectionPending");
    expect(hawMessagesSource).toContain("docsViewer.translation.status.projectionFailed");
    expect(hawMessagesSource).toContain("docsViewer.translation.status.projectionCancelled");
    expect(hawMessagesSource).toContain("docsViewer.translation.status.projectionStale");
    expect(hawMessagesSource).toContain("docsViewer.translation.status.projectionDegraded");
    expect(panelSource).toContain("data-doc-translation-summary-total");
    expect(panelSource).toContain("data-doc-translation-summary-pending");
    expect(panelSource).toContain("data-doc-translation-summary-ready");
    expect(panelSource).toContain("data-doc-translation-summary-error");
    expect(panelSource).toContain("data-doc-translation-summary-health");
    expect(panelSource).toContain("data-doc-translation-summary-display-status");
    expect(panelSource).toContain("data-doc-translation-summary-label-visible");
    expect(panelSource).toContain("translationEligible ? (");
    expect(panelSource).toContain("!translationStatusLabel && \"hidden\"");
    expect(panelSource).toContain("data-doc-translation-summary-renderable");
    expect(panelSource).toContain("data-doc-translation-summary-has-errors");
    expect(panelSource).toContain("data-doc-translation-summary-projected");
    expect(panelSource).toContain("data-doc-translation-summary-stale");
    expect(panelSource).toContain("data-doc-translation-summary-cancelled");
    expect(panelSource).toContain("data-doc-translation-summary-failed");
    expect(panelSource).toContain("data-doc-translation-summary-latest-status");
    expect(panelSource).toContain("data-doc-translation-summary-latest-observed-at-ms");
    expect(panelSource).toContain("data-doc-translation-summary-latest-source-event-id");
    expect(panelSource).toContain("data-doc-translation-summary-latest-source-event-ms");
    expect(panelSource).toContain("data-doc-translation-summary-latest-observation-ref");
    expect(panelSource).toContain("data-doc-translation-summary-latest-receipt-ref");
    expect(panelSource).toContain("data-doc-translation-summary-latest-visible-observation-ref");
    expect(panelSource).toContain("data-doc-translation-summary-latest-visible-receipt-ref");
    expect(panelSource).toContain("data-doc-translation-summary-latest-evidence-observation-ref");
    expect(panelSource).toContain("data-doc-translation-summary-latest-evidence-receipt-ref");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-id");
    expect(panelSource).toContain("data-doc-translation-summary-latest-observation-lane-session-id");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-id-from-projection");
    expect(panelSource).toContain("data-doc-translation-summary-latest-source-binding-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-observation-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-observation-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-event-id");
    expect(panelSource).toContain("data-doc-translation-summary-latest-has-observation");
    expect(panelSource).toContain("data-doc-translation-summary-latest-selected-backend-provider");
    expect(panelSource).toContain("data-doc-translation-summary-latest-chunk-id");
    expect(panelSource).toContain("data-doc-translation-summary-latest-chunk-index");
    expect(panelSource).toContain("data-doc-translation-summary-latest-dedupe-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-source");
    expect(panelSource).toContain("data-doc-translation-summary-latest-source-id");
    expect(panelSource).toContain("data-doc-translation-summary-latest-source-hash");
    expect(panelSource).toContain("data-doc-translation-summary-latest-source-kind");
    expect(panelSource).toContain("data-doc-translation-summary-latest-source-text-hash");
    expect(panelSource).toContain("data-doc-translation-summary-latest-source-text-char-count");
    expect(panelSource).toContain("data-doc-translation-summary-latest-projection-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-server-projection-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-projection-target");
    expect(panelSource).toContain("data-doc-translation-summary-latest-account-locale");
    expect(panelSource).toContain("data-doc-translation-summary-latest-target-language");
    expect(panelSource).toContain("data-doc-translation-summary-latest-projection-status");
    expect(panelSource).toContain("data-doc-translation-summary-latest-freshness-status");
    expect(panelSource).toContain("data-doc-translation-summary-latest-terminal-authority-status");
    expect(panelSource).toContain("data-doc-translation-summary-latest-cancel-requested");
    expect(panelSource).toContain("data-doc-translation-summary-latest-error");
    expect(panelSource).toContain("data-doc-translation-summary-suppressed-receipts");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-observation-ref");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-receipt-ref");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-observation-lane-session-id");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-goal-binding-id");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-source-binding-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-observation-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-mail-loop-observation-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-goal-binding-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-event-id");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-has-observation");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-selected-backend-provider");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-projection-status");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-chunk-id");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-chunk-index");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-dedupe-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-source-event-id");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-source-event-ms");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-observed-at-ms");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-freshness-status");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-display-status");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-terminal-authority-status");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-source-id");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-source-hash");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-source-kind");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-source-text-hash");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-source-text-char-count");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-projection-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-server-projection-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-account-locale");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-projection-target");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-target-language");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-cancel-requested");
    expect(panelSource).toContain("data-doc-translation-summary-latest-suppressed-reason");
    expect(panelSource).toContain("data-doc-translation-summary-lane-sessions");
    expect(panelSource).toContain("data-doc-translation-summary-active-lane-sessions");
    expect(panelSource).toContain("data-doc-translation-summary-paused-lane-sessions");
    expect(panelSource).toContain("data-doc-translation-summary-stopped-lane-sessions");
    expect(panelSource).toContain("data-doc-translation-summary-blocked-lane-sessions");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-status");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-health");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-lifecycle-action");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-debug-phase");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-observation-status");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-permission-profile");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-updated-at-ms");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-event-id");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-control-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-source-binding-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-source-identity-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-has-observation");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-source-id");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-source-hash");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-source-kind");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-source-text-hash");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-source-text-char-count");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-projection-target");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-account-locale");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-target-language");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-chunk-id");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-chunk-index");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-dedupe-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-source-event-id");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-source-event-ms");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-observed-at-ms");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-freshness-status");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-selected-backend-provider");
    expect(panelSource).toContain("data-doc-translation-summary-latest-lane-session-terminal-authority-status");
    expect(panelSource).toContain("data-doc-translation-summary-mail-loops");
    expect(panelSource).toContain("data-doc-translation-summary-pending-mail-loops");
    expect(panelSource).toContain("data-doc-translation-summary-blocked-mail-loops");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-status");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-id");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-mailbox-wake-expected");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-decision-wake-expected");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-observation-lane-session-id");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-session-control-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-source-binding-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-source-identity-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-lane-session-source-binding-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-lane-session-source-identity-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-source-id");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-source-hash");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-source-kind");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-source-text-hash");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-source-text-char-count");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-projection-target");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-account-locale");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-target-language");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-chunk-id");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-chunk-index");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-dedupe-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-source-event-id");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-source-event-ms");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-observed-at-ms");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-freshness-status");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-selected-backend-provider");
    expect(panelSource).toContain("data-doc-translation-summary-latest-mail-loop-terminal-authority-status");
    expect(panelSource).toContain("data-doc-translation-summary-goal-bindings");
    expect(panelSource).toContain("data-doc-translation-summary-active-goal-bindings");
    expect(panelSource).toContain("data-doc-translation-summary-blocked-goal-bindings");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-id");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-id");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-lane-session-id");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-status");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-session-status");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-session-health");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-activation-policy");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-attention-policy");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-stop-condition");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-report-policy");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-quiet-behavior");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-report-action");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-report-reason");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-mailbox-wake-expected");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-decision-wake-expected");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-selected-backend-provider");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-observation-ref");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-receipt-ref");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-event-id");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-source-binding-key-from-event");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-source-identity-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-lane-session-source-binding-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-lane-session-source-identity-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-has-observation");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-terminal-authority-status");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-source-id");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-source-hash");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-source-kind");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-source-text-hash");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-source-text-char-count");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-projection-target");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-account-locale");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-target-language");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-chunk-id");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-chunk-index");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-dedupe-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-source-binding-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-observation-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-mail-loop-observation-key");
    expect(panelSource).toContain("data-doc-translation-summary-latest-goal-binding-key-from-binding");
    expect(panelSource).toContain("data-doc-translation-summary-terminal-eligible=\"false\"");
    expect(panelSource).toContain("data-doc-translation-summary-assistant-answer=\"false\"");
    expect(panelSource).toContain("data-doc-translation-summary-raw-content-included=\"false\"");
    expect(panelSource).toContain("data-doc-translation-control=\"inline-account-language\"");
    expect(panelSource).toContain("data-doc-translation-control-action={inlineTranslationEnabled ? \"stop\" : \"start\"}");
    expect(panelSource).toContain("data-doc-translation-control-enabled={String(inlineTranslationEnabled)}");
    expect(panelSource).toContain("data-doc-translation-control-lane-session-id={latestOrNextTranslationLaneSessionId ?? \"\"}");
    expect(panelSource).toContain("data-doc-translation-control-source-id={translationSourceId ?? \"\"}");
    expect(panelSource).toContain("data-doc-translation-control-target-language={translationTargetLanguage}");
    expect(panelSource).toContain("data-doc-translation-control-account-locale={translationAccountLocale}");
    expect(panelSource).toContain("data-doc-translation-control-source-hash={translationSourceHash ?? \"\"}");
    expect(panelSource).toContain("data-doc-translation-control-source-text-hash={translationSourceTextHash ?? \"\"}");
    expect(panelSource).toContain("data-doc-translation-control-source-text-char-count={translationSourceTextCharCount ?? \"\"}");
    expect(panelSource).toContain("data-doc-translation-control-source-identity-key={latestOrNextTranslationSourceIdentityKey ?? \"\"}");
    expect(panelSource).toContain("data-doc-translation-control-projection-target={HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK}");
    expect(panelSource).toContain("data-doc-translation-control-terminal-eligible=\"false\"");
    expect(panelSource).toContain("data-doc-translation-control-assistant-answer=\"false\"");
    expect(panelSource).toContain("data-doc-translation-control-raw-content-included=\"false\"");
    expect(panelSource).toContain("onToggleInlineTranslationSessionPause={handleToggleInlineTranslationSessionPause}");
    expect(panelSource).toContain("const handleToggleInlineTranslationSessionPause = React.useCallback");
    expect(panelSource).toContain("liveTranslationProjectionSummary.latestLaneSessionStatus === \"paused\"");
    expect(panelSource).toContain("data-doc-translation-session-control=\"pause-resume\"");
    expect(panelSource).toContain("data-doc-translation-session-control-action={isTranslationLaneSessionPaused ? \"resume\" : \"pause\"}");
    expect(panelSource).toContain("data-doc-translation-session-control-lane-session-id={latestOrNextTranslationLaneSessionId ?? \"\"}");
    expect(panelSource).toContain("data-doc-translation-session-control-source-id={translationSourceId ?? \"\"}");
    expect(panelSource).toContain("data-doc-translation-session-control-source-hash={translationSourceHash ?? \"\"}");
    expect(panelSource).toContain("data-doc-translation-session-control-source-text-hash={translationSourceTextHash ?? \"\"}");
    expect(panelSource).toContain("data-doc-translation-session-control-source-text-char-count={translationSourceTextCharCount ?? \"\"}");
    expect(panelSource).toContain("data-doc-translation-session-control-source-identity-key={latestOrNextLaneSessionSourceIdentityKey ?? \"\"}");
    expect(panelSource).toContain("data-doc-translation-session-control-terminal-eligible=\"false\"");
    expect(panelSource).toContain("data-doc-translation-session-control-assistant-answer=\"false\"");
    expect(panelSource).toContain("data-doc-translation-session-control-raw-content-included=\"false\"");
    expect(panelSource).toContain("t(\"docsViewer.translation.pauseSession\")");
    expect(panelSource).toContain("t(\"docsViewer.translation.resumeSession\")");
    expect(panelSource).toContain("storedInlineTranslationSessionMatchesScope");
    expect(panelSource).toContain('DOC_INLINE_TRANSLATION_SESSION_PREFIX = "casimir.docs.inlineTranslation.v2"');
    expect(panelSource).toContain("if (session.sourceHash && session.sourceHash !== scope.sourceHash) return false");
    expect(panelSource).toContain("if (scope.sourceIdentityKey && session.sourceIdentityKey !== scope.sourceIdentityKey) return false");
    expect(panelSource).toContain("if (!scope.sourceIdentityKey && session.sourceIdentityKey) return false");
    expect(panelSource).toContain("if (session.sourceTextHash && session.sourceTextHash !== scope.sourceTextHash) return false");
    expect(panelSource).toContain("session.sourceTextCharCount !== scope.sourceTextCharCount");
    expect(panelSource).toContain("if (session.accountLocale && session.accountLocale !== scope.accountLocale) return false");
    expect(panelSource).toContain("if (session.targetLanguage && session.targetLanguage !== scope.targetLanguage) return false");
    expect(panelSource).toContain("if (entry.accountLocale && entry.accountLocale !== documentTranslationAccountLocale) continue");
    expect(panelSource).toContain("if (entry.targetLanguage && entry.targetLanguage !== documentTranslationTargetLanguage) continue");
    expect(panelSource).toContain("entry.translationContractVersion !== DOCUMENT_MARKDOWN_TRANSLATION_CONTRACT_VERSION");
    expect(panelSource).toContain("const hasEntryLanguageBinding = Boolean(entry.accountLocale || entry.targetLanguage)");
    expect(panelSource).toContain("if (!hasEntryLanguageBinding && !entry.sourceIdentityKey) continue");
    expect(panelSource).toContain("readStoredInlineTranslationSession(activeTranslationScopeKey, {");
    expect(panelSource).toContain("writeStoredInlineTranslationSession(activeTranslationScopeKey, {");
    expect(panelSource).toContain("sourceHash: rawMarkdownSourceHash");
    expect(panelSource).toContain("sourceIdentityKey: activeLiveTranslationSourceIdentityKey");
    expect(panelSource).toContain("sourceTextHash: rawMarkdownSourceHash");
    expect(panelSource).toContain("sourceTextCharCount: rawMarkdown.length");
    expect(panelSource).toContain("sourceBindingKey");
    expect(panelSource).toContain("const documentTranslationAccountLocale = interfaceLanguage.bcp47");
    expect(panelSource).toContain("accountLocale: documentTranslationAccountLocale");
    expect(panelSource).toContain("targetLanguage: documentTranslationTargetLanguage");
    const projectionSnapshotRead = panelSource.match(
      /readDocumentLiveTranslationProjectionSnapshot\(\{[\s\S]*?\n        \}\)/,
    )?.[0] ?? "";
    expect(projectionSnapshotRead).toContain("locale: documentTranslationAccountLocale");
    expect(projectionSnapshotRead).toContain("sourceHash: rawMarkdownSourceHash");
    expect(projectionSnapshotRead).not.toContain("sourceIdentityKey: activeLiveTranslationSourceIdentityKey");
    expect(projectionSnapshotRead).toContain("projectionTarget: HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK");
    const projectionEventIngestion = panelSource.match(
      /installDocumentLiveTranslationProjectionEventIngestion\(\{[\s\S]*?\n    \}\);/,
    )?.[0] ?? "";
    expect(projectionEventIngestion).toContain("sourceHash: rawMarkdownSourceHash");
    expect(projectionEventIngestion).not.toContain("sourceIdentityKey: activeLiveTranslationSourceIdentityKey");
    expect(projectionEventIngestion).not.toContain("sourceTextHash: rawMarkdownSourceHash");
    expect(projectionEventIngestion).not.toContain("sourceTextCharCount: rawMarkdown.length");
    expect(projectionEventIngestion).toContain("projectionTarget: HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK");
    expect(panelSource).toContain("readRecordArray(input.response.capability_lane_turn_timeline)");
    expect(panelSource).toContain("readRecordArray(debug.capability_lane_turn_timeline)");
    expect(panelSource).toContain("readLocalString(entry.stage) === \"lane_session\"");
    expect(panelSource).toContain("const emittedEventIds = new Set<string>()");
    expect(panelSource).toContain("readLocalScalarString(summary.seq)");
    const laneSessionInspection = panelSource.match(
      /listDocumentMarkdownTranslationLaneSessions\(\{[\s\S]*?\n      \}\)/,
    )?.[0] ?? "";
    expect(laneSessionInspection).toContain("sourceIdentityKey");
    expect(laneSessionInspection).toContain("projectionTarget: HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK");
    expect(laneSessionInspection).toContain('agentRuntime: "helix"');
    const pendingInlineState = panelSource.match(
      /buildPendingDocumentInlineTranslationState\(\{[\s\S]*?\n    \}\);/,
    )?.[0] ?? "";
    expect(pendingInlineState).toContain("accountLocale: documentTranslationAccountLocale");
    expect(pendingInlineState).toContain("targetLanguage: documentTranslationTargetLanguage");
    expect(pendingInlineState).toContain("sourceTextHash: hashDocumentSource(sourceText)");
    expect(pendingInlineState).toContain("sourceIdentityKey: activeLiveTranslationSourceIdentityKey");
    expect(pendingInlineState).toContain("latestSourceIdentityKey: activeLiveTranslationSourceIdentityKey");
    const markdownMailEnqueue = panelSource.match(
      /enqueueDocumentMarkdownTranslationMail\(\{[\s\S]*?\n      \}\);/,
    )?.[0] ?? "";
    expect(markdownMailEnqueue).toContain("locale: documentTranslationAccountLocale");
    expect(markdownMailEnqueue).toContain("targetLanguage: documentTranslationTargetLanguage");
    expect(markdownMailEnqueue).toContain("accountLocale: documentTranslationAccountLocale");
    expect(markdownMailEnqueue).toContain("sourceIdentityKey: pendingTranslationState.sourceIdentityKey");
    expect(markdownMailEnqueue).toContain("projectionTarget: HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK");
    const laneSessionControl = panelSource.match(
      /runDocumentMarkdownTranslationLaneSessionControl\(\{[\s\S]*?\n      \}\);/,
    )?.[0] ?? "";
    expect(laneSessionControl).toContain("locale: documentTranslationAccountLocale");
    expect(laneSessionControl).toContain("targetLanguage: documentTranslationTargetLanguage");
    expect(laneSessionControl).toContain("accountLocale: documentTranslationAccountLocale");
    expect(laneSessionControl).toContain("sourceIdentityKey");
    expect(laneSessionControl).toContain("projectionTarget: HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK");
    expect(clientSource).toContain("runCapabilityLaneSessionControl({");
    expect(clientSource).toContain("capability_lane_session_call:");
    expect(agiApiSource).toContain("/api/agi/capability-lanes/session");
    expect(agiApiSource).toContain("capability_lane_session_call");
    expect(agiApiSource).toContain("terminal_eligible?: false");
    expect(agiApiSource).toContain("assistant_answer?: false");
    expect(agiApiSource).toContain("raw_content_included?: false");
    const inlineRendererSource = readFileSync(
      join(process.cwd(), "client/src/lib/docs/liveTranslationInlineRenderer.ts"),
      "utf8",
    );
    const cssSource = readFileSync(join(process.cwd(), "client/src/index.css"), "utf8");
    expect(panelSource).toContain("renderDocumentMarkdownWithInlineTranslations({");
    expect(inlineRendererSource).toContain("buildDocumentInlineTranslationDataAttributes(state)");
    expect(inlineRendererSource).toContain('source_markdown}\\n\\n${anchor}');
    expect(inlineRendererSource).toContain('.join("\\n\\n")');
    expect(inlineRendererSource).toContain('`${name}="${escapeHtml(value)}"`');
    expect(panelSource).toContain("activeInlineTranslationReticleTargetRef");
    expect(panelSource).toContain("findActiveInlineTranslationReticleTarget({");
    expect(panelSource).toContain("translationReticleViewportTick");
    expect(panelSource).toContain("scheduleInlineTranslationReticleRefresh()");
    expect(panelSource).toContain("collectVisibleTranslationUnitIds({");
    expect(panelSource).toContain("clearDocTranslationReticleTarget");
    expect(panelSource).toContain("reticleTarget.element.classList.add(DOC_AUTO_READ_ACTIVE_CLASS)");
    expect(panelSource).toContain('setAttribute("data-doc-translation-reticle", reticleTarget.status)');
    expect(panelSource).toContain('status: "candidate" | "loading"');
    expect(panelSource).toContain('setAttribute("data-doc-translation-reticle-unit-id", reticleTarget.unitId)');
    expect(panelSource).toContain('element.getAttribute("data-doc-read-active") !== "true"');
    expect(panelSource).toContain("adoptedTranslation");
    expect(panelSource).toContain("window.setTimeout(() => void requestVisibleInlineTranslations(), DOC_TRANSLATION_SCAN_DEBOUNCE_MS)");
    expect(cssSource).toContain('.doc-read-active-section[data-doc-translation-reticle="candidate"]');
    expect(cssSource).toContain('.doc-read-active-section[data-doc-translation-reticle="loading"]');
    expect(cssSource).toContain("outline-style: dotted");
    expect(panelSource).toContain("type DocumentInlineTranslationRenderState");
    expect(panelSource).toContain("type InlineTranslationState = DocumentInlineTranslationRenderState");
    expect(panelSource).toContain("documentMarkdownTranslationEntryToInlineRenderState(entry)");
    expect(panelSource).toContain("const sourceId = activeDocument.sourceId");
    expect(panelSource).toContain("DOC_TRANSLATION_MAX_UNITS_PER_CHUNK = 1");
    expect(panelSource).toContain("DOC_TRANSLATION_MAX_CHARS_PER_CHUNK = 2200");
    expect(panelSource).toContain("documentTranslationChunkInFlightRef");
    expect(panelSource).toContain("const chunkId = `doc-inline:${rawMarkdownSourceHash}:${targetIds.join(\",\")}`");
    expect(panelSource).toContain("buildPendingDocumentInlineTranslationState({");
    expect(panelSource).toContain("sourceIdentityKey: pendingTranslationState.sourceIdentityKey");
    expect(panelSource).toContain("sourceIdentityKey: session.sourceIdentityKey ?? null");
    expect(panelSource).toContain("sourceIdentityKey: scope.sourceIdentityKey");
    expect(panelSource).toContain("projectionStatus: \"missing\"");
    expect(panelSource).toContain("observationLaneSessionId: null");
    expect(panelSource).toContain("goalBindingId: null");
    expect(panelSource).toContain("latestEventId: null");
    expect(panelSource).toContain("hasObservation: false");
    expect(panelSource).toContain("freshnessStatus: \"pending\"");
    expect(panelSource).toContain("terminalAuthorityStatus: \"not_terminal_authority\"");
    expect(panelSource).toContain("data-doc-translation-summary-answer-authority=\"false\"");
    expect(panelSource).toContain("terminalEligible: false");
    expect(panelSource).toContain("assistantAnswer: false");
    expect(panelSource).toContain("rawContentIncluded: false");
    expect(panelSource).toContain("targetLanguage: documentTranslationTargetLanguage");
    expect(panelSource).toContain("accountLocale: documentTranslationAccountLocale");
    expect(panelSource).toContain("projectionTarget: HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK");
    expect(panelSource).not.toContain("requestDocumentTranslationUnits");
    expect(clientSource).toContain("/api/helix/stage-play/live-source-mail/document-markdown");
    expect(clientSource).toContain("/api/helix/stage-play/live-source-mail?");
    expect(clientSource).toContain('view: "full"');
    expect(clientSource).toContain("chunkId: params.chunkId");
    expect(clientSource).toContain("/api/helix/stage-play/micro-reasoner-prompt-preset/apply");
    expect(clientSource).toContain("stage_play_micro_reasoner_prompt_preset:document-translate-haw-inline:v1");
    expect(stagePlayRouteSource).toContain("DOCUMENT_MARKDOWN_TRANSLATION_MAX_UNITS_PER_MAIL = 3");
    expect(stagePlayRouteSource).toContain("DOCUMENT_MARKDOWN_TRANSLATION_MAX_CHARS_PER_MAIL = 2200");
    expect(stagePlayRouteSource).toContain("deferredUnits");
    expect(stagePlayRouteSource).toContain("acceptedChars");
  });
});
