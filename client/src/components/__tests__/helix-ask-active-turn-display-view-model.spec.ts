import { describe, expect, it } from "vitest";

import {
  buildHelixAskActiveTurnDisplayViewModel,
  HELIX_ASK_ACTIVE_TURN_QUIET_GAP_MS,
  HELIX_ASK_ACTIVE_TURN_QUIET_GAP_STATUS_TEXT,
} from "@/components/helix/ask-console/HelixAskActiveTurnDisplayViewModel";
import type { HelixContinuousTurnStreamRow } from "@/lib/helix/ask-active-turn-stream";

const transcriptRow: HelixContinuousTurnStreamRow = {
  key: "row-1",
  source: "agent_work",
  label: "Model Re-entry",
  text: "Model re-entry completed.",
  meta: "source live_provider_transcript",
  status: "completed",
  tone: "checkpoint",
  evidenceRefs: [],
};

const laneVisibleRow: HelixContinuousTurnStreamRow = {
  key: "lane-visible",
  source: "agent_work",
  label: "Lane Visible",
  text: "Lane visible: live_translation.",
  meta: "source model_visible_capability_lane_manifest | lane_visible",
  status: "available",
  tone: "working",
  evidenceRefs: [],
};

const laneReenteredRow: HelixContinuousTurnStreamRow = {
  key: "lane-reentered",
  source: "agent_work",
  label: "Lane Re-entry",
  text: "Observation packet re-entered provider context.",
  meta: "source capability_lane_observation_packets | lane_reentered",
  status: "reentered",
  tone: "checkpoint",
  evidenceRefs: ["ask:lane:translation:obs"],
};

const laneRequestedRow: HelixContinuousTurnStreamRow = {
  key: "lane-requested",
  source: "agent_work",
  label: "Lane Request",
  text: "Lane requested: live_translation.translate_text.",
  meta: "source capability_lane_call_results | lane_requested",
  status: "requested",
  tone: "working",
  evidenceRefs: [],
};

describe("HelixAskActiveTurnDisplayViewModel", () => {
  it("keeps quiet provider status outside numbered transcript rows", () => {
    const view = buildHelixAskActiveTurnDisplayViewModel({
      askBusy: true,
      rows: [transcriptRow],
      replyId: "ask:turn-1",
      lastTranscriptEventAppliedAtMs: 1000,
      nowMs: 1000 + HELIX_ASK_ACTIVE_TURN_QUIET_GAP_MS + 250,
    });

    expect(view.visibleRows).toEqual([transcriptRow]);
    expect(view.visibleRows).toHaveLength(1);
    expect(view.statusLine).toBe(HELIX_ASK_ACTIVE_TURN_QUIET_GAP_STATUS_TEXT);
    expect(view.quietGapVisible).toBe(true);
    expect(view.msSinceLastTranscriptEvent).toBe(HELIX_ASK_ACTIVE_TURN_QUIET_GAP_MS + 250);
    expect(view.scrollToken).toContain("quiet_gap");
    expect(view.scrollToken).not.toContain("Provider running");
  });

  it("does not scroll repeatedly as quiet elapsed time changes", () => {
    const first = buildHelixAskActiveTurnDisplayViewModel({
      askBusy: true,
      rows: [transcriptRow],
      replyId: "ask:turn-1",
      lastTranscriptEventAppliedAtMs: 1000,
      nowMs: 1000 + HELIX_ASK_ACTIVE_TURN_QUIET_GAP_MS + 250,
    });
    const later = buildHelixAskActiveTurnDisplayViewModel({
      askBusy: true,
      rows: [transcriptRow],
      replyId: "ask:turn-1",
      lastTranscriptEventAppliedAtMs: 1000,
      nowMs: 1000 + HELIX_ASK_ACTIVE_TURN_QUIET_GAP_MS + 5000,
    });

    expect(first.statusLine).toBe(later.statusLine);
    expect(first.scrollToken).toBe(later.scrollToken);
    expect(later.msSinceLastTranscriptEvent).toBeGreaterThan(first.msSinceLastTranscriptEvent ?? 0);
  });

  it("does not show quiet status before the threshold or after the turn is idle", () => {
    expect(buildHelixAskActiveTurnDisplayViewModel({
      askBusy: true,
      rows: [transcriptRow],
      replyId: "ask:turn-1",
      lastTranscriptEventAppliedAtMs: 1000,
      nowMs: 1500,
    }).statusLine).toBeNull();

    expect(buildHelixAskActiveTurnDisplayViewModel({
      askBusy: false,
      rows: [transcriptRow],
      replyId: "ask:turn-1",
      lastTranscriptEventAppliedAtMs: 1000,
      nowMs: 5000,
    }).statusLine).toBeNull();
  });

  it("does not show quiet status after the terminal packet is received", () => {
    const view = buildHelixAskActiveTurnDisplayViewModel({
      askBusy: true,
      rows: [transcriptRow],
      replyId: "ask:turn-1",
      lastTranscriptEventAppliedAtMs: 1000,
      nowMs: 1000 + HELIX_ASK_ACTIVE_TURN_QUIET_GAP_MS + 5000,
      terminalPacketReceived: true,
    });

    expect(view.statusLine).toBeNull();
    expect(view.quietGapVisible).toBe(false);
    expect(view.scrollToken).toContain("active");
  });

  it("summarizes visible-only lane rows without treating the lane as executed", () => {
    const view = buildHelixAskActiveTurnDisplayViewModel({
      askBusy: true,
      rows: [laneVisibleRow],
      replyId: "ask:turn-lane-visible",
      lastTranscriptEventAppliedAtMs: 1000,
      nowMs: 1100,
    });

    expect(view.capabilityLaneSummary).toMatchObject({
      lifecycleStatus: "visible_only",
      visibleCount: 1,
      requestedCount: 0,
      backendSelectedCount: 0,
      observedCount: 0,
      reenteredCount: 0,
      terminalSelectedCount: 0,
      visibleLaneDoesNotMeanExecuted: true,
    });
  });

  it("summarizes requested-only lane rows without treating the lane as executed", () => {
    const view = buildHelixAskActiveTurnDisplayViewModel({
      askBusy: true,
      rows: [laneVisibleRow, laneRequestedRow],
      replyId: "ask:turn-lane-requested",
      lastTranscriptEventAppliedAtMs: 1000,
      nowMs: 1100,
    });

    expect(view.capabilityLaneSummary).toMatchObject({
      lifecycleStatus: "requested",
      visibleCount: 1,
      requestedCount: 1,
      backendSelectedCount: 0,
      observedCount: 0,
      reenteredCount: 0,
      terminalSelectedCount: 0,
      terminalRejectedCount: 0,
      visibleLaneDoesNotMeanExecuted: true,
    });
  });

  it("summarizes re-entered lane observations for the visible active turn", () => {
    const view = buildHelixAskActiveTurnDisplayViewModel({
      askBusy: true,
      rows: [laneVisibleRow, laneReenteredRow],
      replyId: "ask:turn-lane-reentered",
      lastTranscriptEventAppliedAtMs: 1000,
      nowMs: 1100,
    });

    expect(view.capabilityLaneSummary).toMatchObject({
      lifecycleStatus: "reentered",
      visibleCount: 1,
      reenteredCount: 1,
      terminalSelectedCount: 0,
      visibleLaneDoesNotMeanExecuted: true,
    });
  });
});
