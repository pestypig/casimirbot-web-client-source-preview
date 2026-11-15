import { describe, expect, it } from "vitest";
import {
  readStagePlayMailObserverProfile,
  readStagePlayPacketGoalRelevance,
} from "../panels/stagePlayEvidenceDisplay";

describe("Stage Play evidence display", () => {
  const oldId = "stage_play_visual_observer_profile:recorded";
  const currentId = "stage_play_visual_observer_profile:current";
  const profiles = [{ profileId: currentId, title: "Current profile" }, { profileId: oldId, title: "Recorded profile" }];

  it("attributes historical mail to its stamped profile, not the current profile", () => {
    expect(readStagePlayMailObserverProfile({ evidenceRefs: [oldId] }, profiles)).toEqual({
      observerProfileId: oldId, observerProfileTitle: "Recorded profile",
    });
  });

  it("preserves a stamped ID when profile metadata is unavailable", () => {
    expect(readStagePlayMailObserverProfile({ evidenceRefs: [oldId] }, [])).toEqual({
      observerProfileId: oldId, observerProfileTitle: null,
    });
  });

  it("does not guess an observer for unstamped mail", () => {
    expect(readStagePlayMailObserverProfile({ evidenceRefs: ["visual_frame:one"] }, profiles)).toEqual({
      observerProfileId: null, observerProfileTitle: null,
    });
    expect(readStagePlayMailObserverProfile(null, profiles).observerProfileId).toBeNull();
  });

  it("deduplicates a repeated stamp but leaves conflicting stamps unattributed", () => {
    expect(readStagePlayMailObserverProfile({ evidenceRefs: [oldId, oldId] }, profiles).observerProfileId).toBe(oldId);
    expect(readStagePlayMailObserverProfile({ evidenceRefs: [oldId, currentId] }, profiles)).toEqual({
      observerProfileId: null, observerProfileTitle: null,
    });
  });

  const relevance = { goalId: "goal:one", relevance: 0.8, reason: "Recorded relevance" };
  it("uses the newest matching packet update without mutating update order", () => {
    const updates = [
      { contentRef: "packet:one", createdAtMs: 20, goalRelevance: relevance },
      { contentRef: "packet:one", createdAtMs: 10, goalRelevance: { ...relevance, relevance: 0.2 } },
      { contentRef: "packet:other", createdAtMs: 30, goalRelevance: { ...relevance, relevance: 1 } },
    ];
    expect(readStagePlayPacketGoalRelevance("packet:one", "goal:one", updates)).toEqual(relevance);
    expect(updates.map((update) => update.createdAtMs)).toEqual([20, 10, 30]);
  });

  it("leaves absent relevance unknown rather than synthesizing a score", () => {
    expect(readStagePlayPacketGoalRelevance("packet:one", "goal:one", [])).toBeNull();
    expect(readStagePlayPacketGoalRelevance("packet:one", "goal:one", [
      { contentRef: "packet:one", createdAtMs: 10, goalRelevance: relevance },
      { contentRef: "packet:one", createdAtMs: 20, goalRelevance: null },
    ])).toBeNull();
  });

  it("does not reuse a relevance assessment from another goal", () => {
    expect(readStagePlayPacketGoalRelevance("packet:one", "goal:two", [
      { contentRef: "packet:one", createdAtMs: 10, goalRelevance: relevance },
    ])).toBeNull();
  });
});
