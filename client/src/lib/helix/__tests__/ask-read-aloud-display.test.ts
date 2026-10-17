import { describe, expect, it } from "vitest";
import {
  buildReadAloudStateMapTransition,
  buildVoiceAutoSpeakUtteranceId,
  canPlayVoiceUtteranceWithMicOff,
  filterReadAloudQueueForReply,
  formatReadAloudButtonLabel,
  hashVoiceUtteranceKey,
  isInterimVoicePlaybackUtteranceKind,
  isManualVoicePlaybackUtterance,
  isMissionVoiceOutputModeEnabled,
  resolveReadAloudButtonPressAction,
  resolveReadAloudRegionTrafficState,
  shouldEnableVoiceRollout,
  shouldPauseReadAloudOnButtonPress,
  shouldResumeReadAloudOnButtonPress,
  shouldStopReadAloudOnButtonPress,
  transitionReadAloudState,
} from "../ask-read-aloud-display";

describe("ask read-aloud display helpers", () => {
  it("maps playback events to read-aloud UI state", () => {
    expect(transitionReadAloudState("idle", "request")).toBe("loading");
    expect(transitionReadAloudState("loading", "audio")).toBe("playing");
    expect(transitionReadAloudState("loading", "suppressed")).toBe("unavailable");
    expect(transitionReadAloudState("loading", "error")).toBe("error");
    expect(transitionReadAloudState("playing", "pause")).toBe("paused");
    expect(transitionReadAloudState("paused", "resume")).toBe("resuming");
    expect(transitionReadAloudState("resuming", "resumed")).toBe("playing");
    expect(transitionReadAloudState("playing", "ended")).toBe("completed");
    expect(transitionReadAloudState("playing", "stop")).toBe("cancelled");
  });

  it("projects read-aloud state-map updates without mutating the current map", () => {
    const current = {
      "reply-1": "idle",
      "reply-2": "playing",
    } as const;

    expect(buildReadAloudStateMapTransition(current, "reply-1", "request")).toEqual({
      "reply-1": "loading",
      "reply-2": "playing",
    });
    expect(current).toEqual({
      "reply-1": "idle",
      "reply-2": "playing",
    });
    expect(buildReadAloudStateMapTransition(current, "reply-3", "error")).toEqual({
      "reply-1": "idle",
      "reply-2": "playing",
      "reply-3": "error",
    });
    expect(buildReadAloudStateMapTransition(current, "", "request")).toBe(current);
  });

  it("formats read-aloud button labels from display state only", () => {
    expect(shouldStopReadAloudOnButtonPress("idle")).toBe(false);
    expect(shouldStopReadAloudOnButtonPress("loading")).toBe(true);
    expect(shouldStopReadAloudOnButtonPress("resuming")).toBe(true);
    expect(shouldPauseReadAloudOnButtonPress("playing")).toBe(true);
    expect(shouldResumeReadAloudOnButtonPress("paused")).toBe(true);
    expect(formatReadAloudButtonLabel("idle")).toBe("Read aloud");
    expect(formatReadAloudButtonLabel("loading")).toBe("Loading read-aloud");
    expect(formatReadAloudButtonLabel("playing")).toBe("Pause read-aloud");
    expect(formatReadAloudButtonLabel("paused")).toBe("Resume read-aloud");
    expect(formatReadAloudButtonLabel("unavailable")).toBe("Read aloud unavailable");
    expect(formatReadAloudButtonLabel("error")).toBe("Retry read-aloud");
    expect(formatReadAloudButtonLabel("unavailable")).not.toMatch(/dry-run/i);
  });

  it("resolves manual read-aloud button actions without owning playback", () => {
    expect(resolveReadAloudButtonPressAction({ currentState: "loading" })).toBe("stop");
    expect(resolveReadAloudButtonPressAction({ currentState: "playing" })).toBe("pause");
    expect(resolveReadAloudButtonPressAction({ currentState: "paused" })).toBe("resume");
    expect(resolveReadAloudButtonPressAction({ currentState: "idle", hasText: false })).toBe("error");
    expect(resolveReadAloudButtonPressAction({ currentState: "unavailable", hasText: true })).toBe("retry");
    expect(resolveReadAloudButtonPressAction({ currentState: "error", hasText: null })).toBe("retry");
  });

  it("projects read-aloud chunk traffic for the active reply region", () => {
    const events = [
      {
        atMs: 100,
        kind: "chunk_synth_start",
        replyId: "reply-1",
        chunkIndex: 0,
        chunkCount: 3,
        text: "Summary:",
      },
      {
        atMs: 120,
        kind: "chunk_play_start",
        replyId: "reply-2",
        chunkIndex: 0,
        chunkCount: 2,
      },
      {
        atMs: 140,
        kind: "chunk_play_start",
        replyId: "reply-1",
        chunkIndex: 1,
        chunkCount: 3,
        text: "The navigation team is ready.",
      },
    ];

    expect(resolveReadAloudRegionTrafficState({
      replyId: "reply-1",
      readAloudState: "loading",
      events,
    })).toMatchObject({
      active: true,
      phase: "loading",
      label: "Loading read-aloud",
      detail: "chunk 1/3",
      chunkIndex: 0,
      chunkCount: 3,
      chunkText: "Summary:",
    });
    expect(resolveReadAloudRegionTrafficState({
      replyId: "reply-1",
      readAloudState: "playing",
      events,
    })).toMatchObject({
      active: true,
      phase: "reading",
      label: "Reading aloud",
      detail: "chunk 2/3",
      chunkIndex: 1,
      chunkCount: 3,
      chunkText: "The navigation team is ready.",
    });
    expect(resolveReadAloudRegionTrafficState({
      replyId: "reply-1",
      readAloudState: "idle",
      events,
    })).toBeNull();
  });

  it("projects reading and preloading chunks as separate regions", () => {
    const events = [
      {
        atMs: 100,
        kind: "chunk_play_start",
        replyId: "reply-1",
        chunkIndex: 0,
        chunkCount: 2,
        text: "The first sentence is being read.",
      },
      {
        atMs: 120,
        kind: "chunk_synth_start",
        replyId: "reply-1",
        chunkIndex: 1,
        chunkCount: 2,
        text: "The second sentence is being prepared.",
      },
      {
        atMs: 130,
        kind: "chunk_synth_ok",
        replyId: "reply-1",
        chunkIndex: 1,
        chunkCount: 2,
        text: "The second sentence is being prepared.",
        detail: "prefetch synth 120ms",
      },
    ];

    expect(resolveReadAloudRegionTrafficState({
      replyId: "reply-1",
      readAloudState: "playing",
      events,
    })).toMatchObject({
      active: true,
      phase: "reading",
      chunkIndex: 0,
      chunkText: "The first sentence is being read.",
      regions: [
        {
          phase: "reading",
          chunkIndex: 0,
          chunkText: "The first sentence is being read.",
        },
        {
          phase: "preloading",
          chunkIndex: 1,
          chunkText: "The second sentence is being prepared.",
        },
      ],
    });
  });

  it("requires reply-scoped playback events before advancing the active read-aloud region", () => {
    expect(resolveReadAloudRegionTrafficState({
      replyId: "reply-1",
      readAloudState: "playing",
      events: [
        {
          atMs: 100,
          kind: "chunk_play_start",
          chunkIndex: 1,
          chunkCount: 2,
          text: "The second sentence is being read.",
        },
      ],
    })).toBeNull();

    expect(resolveReadAloudRegionTrafficState({
      replyId: "reply-1",
      readAloudState: "playing",
      events: [
        {
          atMs: 100,
          kind: "chunk_play_start",
          replyId: "reply-1",
          chunkIndex: 1,
          chunkCount: 2,
          text: "The second sentence is being read.",
        },
      ],
    })).toMatchObject({
      active: true,
      phase: "reading",
      chunkIndex: 1,
      chunkCount: 2,
      chunkText: "The second sentence is being read.",
    });
  });

  it("drops an ended chunk while keeping the next preloaded chunk visible", () => {
    const events = [
      {
        atMs: 100,
        kind: "chunk_play_start",
        replyId: "reply-1",
        chunkIndex: 0,
        chunkCount: 2,
        text: "The first sentence is being read.",
      },
      {
        atMs: 200,
        kind: "chunk_play_end",
        replyId: "reply-1",
        chunkIndex: 0,
        chunkCount: 2,
        text: "The first sentence is being read.",
      },
      {
        atMs: 220,
        kind: "chunk_synth_ok",
        replyId: "reply-1",
        chunkIndex: 1,
        chunkCount: 2,
        text: "The second sentence is ready next.",
      },
    ];

    expect(resolveReadAloudRegionTrafficState({
      replyId: "reply-1",
      readAloudState: "playing",
      events,
    })).toMatchObject({
      active: true,
      phase: "preloading",
      chunkIndex: 1,
      chunkCount: 2,
      chunkText: "The second sentence is ready next.",
      regions: [
        {
          phase: "preloading",
          chunkIndex: 1,
          chunkText: "The second sentence is ready next.",
        },
      ],
    });
  });

  it("keeps the last completed chunk visible briefly for UI confirmation", () => {
    const events = [
      {
        atMs: 1_000,
        kind: "chunk_play_end",
        replyId: "reply-1",
        chunkIndex: 1,
        chunkCount: 2,
        text: "The second sentence was just read.",
      },
    ];

    expect(resolveReadAloudRegionTrafficState({
      replyId: "reply-1",
      readAloudState: "completed",
      events,
      nowMs: 4_000,
      completedChunkLingerMs: 5_000,
    })).toMatchObject({
      active: true,
      phase: "completed",
      label: "Read-aloud completed",
      detail: "chunk 2/2",
      chunkText: "The second sentence was just read.",
    });
    expect(resolveReadAloudRegionTrafficState({
      replyId: "reply-1",
      readAloudState: "completed",
      events,
      nowMs: 7_000,
      completedChunkLingerMs: 5_000,
    })).toBeNull();
  });

  it("filters queued read-aloud utterances for the clicked reply", () => {
    const queue = [
      { id: "a", replyId: "reply-1" },
      { id: "b", replyId: "reply-2" },
      { id: "c", replyId: "reply-1" },
      { id: "d", replyId: null },
    ];

    expect(filterReadAloudQueueForReply(queue, "reply-1")).toEqual([
      { id: "b", replyId: "reply-2" },
      { id: "d", replyId: null },
    ]);
    expect(filterReadAloudQueueForReply(queue, "")).toEqual(queue);
    expect(filterReadAloudQueueForReply(queue, undefined)).not.toBe(queue);
  });

  it("builds stable voice utterance IDs and hashes without owning playback scheduling", () => {
    expect(hashVoiceUtteranceKey("voice:turn:one")).toBe(hashVoiceUtteranceKey("voice:turn:one"));
    expect(hashVoiceUtteranceKey("voice:turn:one")).not.toBe(hashVoiceUtteranceKey("voice:turn:two"));
    expect(buildVoiceAutoSpeakUtteranceId([" reply-1 ", null, " final "])).toBe("reply-1:final");

    const longId = buildVoiceAutoSpeakUtteranceId(["x".repeat(220)]);
    expect(longId.length).toBeLessThanOrEqual(180);
    expect(longId).toMatch(/:[a-f0-9]{8}$/);
  });

  it("classifies voice utterance display predicates structurally", () => {
    expect(isManualVoicePlaybackUtterance({ kind: "manual_read_aloud" })).toBe(true);
    expect(isManualVoicePlaybackUtterance({ source: "manual" })).toBe(true);
    expect(isManualVoicePlaybackUtterance({ kind: "auto_brief", source: "auto" })).toBe(false);
    expect(canPlayVoiceUtteranceWithMicOff({ kind: "manual_read_aloud" })).toBe(true);
    expect(canPlayVoiceUtteranceWithMicOff({ source: "manual" })).toBe(true);
    expect(canPlayVoiceUtteranceWithMicOff({ source: "auto", allowMicOffPlayback: true })).toBe(true);
    expect(canPlayVoiceUtteranceWithMicOff({ source: "auto", allowMicOffPlayback: false })).toBe(false);
    expect(canPlayVoiceUtteranceWithMicOff(null)).toBe(false);
    expect(isInterimVoicePlaybackUtteranceKind("tool_receipt")).toBe(true);
    expect(isInterimVoicePlaybackUtteranceKind("panel_narration")).toBe(true);
    expect(isInterimVoicePlaybackUtteranceKind("final_answer")).toBe(false);
    expect(isMissionVoiceOutputModeEnabled("normal")).toBe(true);
    expect(isMissionVoiceOutputModeEnabled("muted")).toBe(false);
  });

  it("evaluates voice rollout gates deterministically", () => {
    expect(shouldEnableVoiceRollout({ enabled: false, killSwitch: false, activePercent: 100, key: "a" })).toBe(false);
    expect(shouldEnableVoiceRollout({ enabled: true, killSwitch: true, activePercent: 100, key: "a" })).toBe(false);
    expect(shouldEnableVoiceRollout({ enabled: true, killSwitch: false, activePercent: 0, key: "a" })).toBe(false);
    expect(shouldEnableVoiceRollout({ enabled: true, killSwitch: false, activePercent: 100, key: "a" })).toBe(true);
    expect(
      shouldEnableVoiceRollout({ enabled: true, killSwitch: false, activePercent: 37, key: "stable-key" }),
    ).toBe(
      shouldEnableVoiceRollout({ enabled: true, killSwitch: false, activePercent: 37, key: "stable-key" }),
    );
  });
});
