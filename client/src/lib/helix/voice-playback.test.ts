import { describe, expect, it } from "vitest";
import {
  applyVoicePlaybackTimelineMetaUpdate,
  applyLatestWinsVoiceQueue,
  buildVoicePlaybackTimelineMeta,
  createVoicePlaybackUtterance,
  prepareVoicePlaybackQueueUpdate,
  segmentVoicePlaybackText,
  trimVoicePlaybackQueue,
} from "@/lib/helix/voice-playback";

describe("segmentVoicePlaybackText", () => {
  it("splits long text using punctuation-first boundaries", () => {
    const text =
      "Negative energy density is a theoretical concept in quantum field theory. " +
      "It appears in discussions of Casimir effects, wormholes, and warp-drive papers. " +
      "Practical engineering remains speculative, and constraints from quantum inequalities are strict.";
    const chunks = segmentVoicePlaybackText(text, {
      targetMinChars: 90,
      targetMaxChars: 160,
      hardMaxChars: 220,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 220)).toBe(true);
    expect(chunks[0]?.endsWith(".")).toBe(true);
  });

  it("falls back to hard word-boundary splits when a phrase is too long", () => {
    const word = "a".repeat(260);
    const chunks = segmentVoicePlaybackText(`${word} ${word}`, {
      targetMinChars: 60,
      targetMaxChars: 120,
      hardMaxChars: 140,
    });

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.length <= 140)).toBe(true);
  });
});

describe("applyLatestWinsVoiceQueue", () => {
  const make = (
    utteranceId: string,
    turnKey: string,
    kind: "brief" | "final" | "tool_receipt" | "manual_read_aloud",
    revision = 1,
    text = "test",
  ) =>
    createVoicePlaybackUtterance({
      utteranceId,
      turnKey,
      kind,
      revision,
      text,
      eventId: utteranceId,
      enqueuedAtMs: 1,
    });

  it("preserves explicit authority, source, and reply metadata on utterances", () => {
    const utterance = createVoicePlaybackUtterance({
      utteranceId: "manual-read-reply-1",
      turnKey: "manual:reply-1",
      kind: "manual_read_aloud",
      authority: "final",
      source: "manual",
      replyId: "reply-1",
      allowMicOffPlayback: true,
      revision: 1,
      text: "Read this answer aloud.",
      eventId: "reply-1",
      enqueuedAtMs: 1,
    });

    expect(utterance.kind).toBe("manual_read_aloud");
    expect(utterance.authority).toBe("final");
    expect(utterance.source).toBe("manual");
    expect(utterance.replyId).toBe("reply-1");
    expect(utterance.allowMicOffPlayback).toBe(true);
  });

  it("replaces queued brief for same turn and clears stale queued briefs from prior turns", () => {
    const queue = [
      make("brief-old-turn-a", "turn-a", "brief"),
      make("brief-old-turn-b", "turn-b", "brief"),
      make("final-turn-z", "turn-z", "final"),
    ];
    const incoming = make("brief-new-turn-b", "turn-b", "brief", 2);
    const next = applyLatestWinsVoiceQueue({
      queue,
      incoming,
      active: make("brief-active-turn-b", "turn-b", "brief"),
    });

    expect(next.queue.map((entry) => entry.utteranceId)).toEqual([
      "brief-new-turn-b",
      "final-turn-z",
    ]);
    expect(next.droppedUtteranceIds.sort()).toEqual([
      "brief-old-turn-a",
      "brief-old-turn-b",
    ]);
    expect(next.supersededActiveReason).toBe(null);
    expect(next.pendingPreemptPolicy).toBe("pending_regen");
  });

  it("queues same-turn final and marks active same-turn brief for sentence-boundary handoff", () => {
    const queue = [
      make("brief-turn-c", "turn-c", "brief", 1),
      make("final-turn-a", "turn-a", "final", 1),
    ];
    const incoming = make("final-turn-c", "turn-c", "final", 2);
    const next = applyLatestWinsVoiceQueue({
      queue,
      incoming,
      active: make("brief-active-turn-c", "turn-c", "brief", 1),
    });

    expect(next.queue.map((entry) => entry.utteranceId)).toEqual(["final-turn-a", "final-turn-c"]);
    expect(next.droppedUtteranceIds).toEqual(["brief-turn-c"]);
    expect(next.pendingPreemptPolicy).toBe("pending_final");
    expect(next.supersededActiveReason).toBe(null);
  });

  it("marks active prior-turn playback for boundary cancel when new-turn brief arrives", () => {
    const queue = [make("final-queued-turn-z", "turn-z", "final")];
    const incoming = make("brief-new-turn-b", "turn-b", "brief");
    const next = applyLatestWinsVoiceQueue({
      queue,
      incoming,
      active: make("final-active-turn-a", "turn-a", "final"),
    });

    expect(next.queue.map((entry) => entry.utteranceId)).toEqual([
      "brief-new-turn-b",
      "final-queued-turn-z",
    ]);
    expect(next.pendingPreemptPolicy).toBe("pending_regen");
    expect(next.supersededActiveReason).toBe(null);
  });

  it("drops stale queued same-turn finals when a newer final revision arrives", () => {
    const queue = [
      make("final-turn-c-r1", "turn-c", "final", 1),
      make("final-turn-c-r2", "turn-c", "final", 2),
      make("final-turn-z-r1", "turn-z", "final", 1),
    ];
    const incoming = make("final-turn-c-r3", "turn-c", "final", 3);
    const next = applyLatestWinsVoiceQueue({
      queue,
      incoming,
      active: null,
    });

    expect(next.queue.map((entry) => entry.utteranceId)).toEqual([
      "final-turn-z-r1",
      "final-turn-c-r3",
    ]);
    expect(next.droppedUtteranceIds.sort()).toEqual(["final-turn-c-r1", "final-turn-c-r2"]);
  });

  it("keeps tool receipts as chronological same-turn observations", () => {
    const queue = [
      make("brief-turn-c-r1", "turn-c", "brief", 1),
      make("receipt-turn-c-r1", "turn-c", "tool_receipt", 1),
      make("final-turn-z-r1", "turn-z", "final", 1),
    ];
    const incoming = make("receipt-turn-c-r2", "turn-c", "tool_receipt", 2);
    const next = applyLatestWinsVoiceQueue({
      queue,
      incoming,
      active: make("final-active-turn-c-r1", "turn-c", "final", 1),
    });

    expect(next.queue.map((entry) => entry.utteranceId)).toEqual([
      "brief-turn-c-r1",
      "receipt-turn-c-r1",
      "final-turn-z-r1",
      "receipt-turn-c-r2",
    ]);
    expect(next.droppedUtteranceIds).toEqual([]);
    expect(next.pendingPreemptPolicy).toBe("none");
  });

  it("does not drop manual read-aloud queued for a different reply when a tool receipt arrives", () => {
    const manual = createVoicePlaybackUtterance({
      utteranceId: "manual-read-reply-1",
      turnKey: "manual:reply-1",
      kind: "manual_read_aloud",
      authority: "final",
      source: "manual",
      replyId: "reply-1",
      revision: 1,
      text: "Manual read aloud should remain queued.",
      eventId: "reply-1",
      enqueuedAtMs: 1,
    });
    const incoming = createVoicePlaybackUtterance({
      utteranceId: "receipt-turn-c-r1",
      turnKey: "turn-c",
      kind: "tool_receipt",
      authority: "final",
      source: "workstation",
      revision: 1,
      text: "Tool receipt voice output.",
      eventId: "tool-event-1",
      enqueuedAtMs: 2,
    });
    const next = applyLatestWinsVoiceQueue({
      queue: [manual],
      incoming,
      active: null,
    });

    expect(next.queue.map((entry) => entry.utteranceId)).toEqual([
      "manual-read-reply-1",
      "receipt-turn-c-r1",
    ]);
    expect(next.droppedUtteranceIds).toEqual([]);
  });
});

describe("trimVoicePlaybackQueue", () => {
  it("keeps newest utterances when queue exceeds max length", () => {
    const queue = ["a", "b", "c", "d"].map((id, index) =>
      createVoicePlaybackUtterance({
        utteranceId: id,
        turnKey: `turn-${index}`,
        kind: "brief",
        revision: 1,
        text: id,
        eventId: id,
        enqueuedAtMs: index,
      }),
    );
    const next = trimVoicePlaybackQueue(queue, 2);

    expect(next.queue.map((entry) => entry.utteranceId)).toEqual(["c", "d"]);
    expect(next.droppedUtteranceIds).toEqual(["a", "b"]);
  });
});

describe("prepareVoicePlaybackQueueUpdate", () => {
  const task = (overrides: Partial<Parameters<typeof prepareVoicePlaybackQueueUpdate>[0]["task"]> = {}) => ({
    key: "voice-task-1",
    turnKey: "turn-a",
    kind: "tool_receipt" as const,
    revision: 1,
    text: "Voice playback helper should queue this text.",
    eventId: "event-1",
    ...overrides,
  });

  it("creates an utterance and applies queue limits in one pure update", () => {
    const result = prepareVoicePlaybackQueueUpdate({
      queue: [],
      active: null,
      task: task(),
      maxTextChars: 2400,
      maxQueueLength: 8,
      isStale: () => false,
    });

    expect(result).toMatchObject({
      accepted: true,
      droppedUtteranceIds: [],
      pendingPreemptPolicy: "none",
      supersededActiveReason: null,
    });
    expect(result.queue.map((entry) => entry.utteranceId)).toEqual(["voice-task-1"]);
    if (result.accepted) {
      expect(result.utterance.text).toBe("Voice playback helper should queue this text.");
      expect(result.utterance.chunks.length).toBeGreaterThan(0);
    }
  });

  it("rejects duplicate active utterances without changing the queue", () => {
    const active = createVoicePlaybackUtterance({
      utteranceId: "active-voice",
      turnKey: "turn-a",
      kind: "tool_receipt",
      revision: 1,
      text: "Voice playback helper should queue this text.",
      eventId: "active-voice",
      enqueuedAtMs: 1,
    });
    const queue = [
      createVoicePlaybackUtterance({
        utteranceId: "queued-other",
        turnKey: "turn-b",
        kind: "tool_receipt",
        revision: 1,
        text: "Other queued text.",
        eventId: "queued-other",
        enqueuedAtMs: 2,
      }),
    ];

    const result = prepareVoicePlaybackQueueUpdate({
      queue,
      active,
      task: task({ key: "incoming-duplicate" }),
      maxTextChars: 2400,
      maxQueueLength: 8,
      isStale: () => false,
    });

    expect(result).toMatchObject({
      accepted: false,
      reason: "duplicate",
      queue,
      droppedUtteranceIds: [],
    });
  });

  it("reports stale queued drops before accepting the incoming utterance", () => {
    const staleQueued = createVoicePlaybackUtterance({
      utteranceId: "stale-final",
      turnKey: "turn-a",
      kind: "final",
      revision: 1,
      text: "Stale final answer.",
      eventId: "stale-final",
      enqueuedAtMs: 1,
    });

    const result = prepareVoicePlaybackQueueUpdate({
      queue: [staleQueued],
      active: null,
      task: task({ key: "voice-task-2", revision: 2 }),
      maxTextChars: 2400,
      maxQueueLength: 8,
      isStale: ({ turnKey, revision, kind }: {
        turnKey: string;
        revision: number;
        kind: "brief" | "final" | "tool_receipt" | "manual_read_aloud" | "translation_relay" | "narrator_read" | "panel_narration";
      }) => kind === "final" && turnKey === "turn-a" && revision === 1,
    });

    expect(result.accepted).toBe(true);
    expect(result.queue.map((entry) => entry.utteranceId)).toEqual(["voice-task-2"]);
    expect(result.droppedUtteranceIds).toContain("stale-final");
  });
});

describe("applyVoicePlaybackTimelineMetaUpdate", () => {
  it("sets metadata and evicts oldest entries over the configured limit", () => {
    const meta = new Map<string, { seq: number }>([
      ["old-a", { seq: 1 }],
      ["old-b", { seq: 2 }],
    ]);

    const result = applyVoicePlaybackTimelineMetaUpdate({
      metaByUtteranceId: meta,
      utteranceId: "new-c",
      meta: { seq: 3 },
      maxEntries: 2,
    });

    expect(result.evictedUtteranceIds).toEqual(["old-a"]);
    expect(result.deletedDroppedUtteranceIds).toEqual([]);
    expect([...meta.keys()]).toEqual(["old-b", "new-c"]);
  });

  it("removes metadata for dropped queued utterances during the same update", () => {
    const meta = new Map<string, { seq: number }>([
      ["dropped-a", { seq: 1 }],
      ["kept-b", { seq: 2 }],
    ]);

    const result = applyVoicePlaybackTimelineMetaUpdate({
      metaByUtteranceId: meta,
      utteranceId: "new-c",
      meta: { seq: 3 },
      droppedUtteranceIds: ["dropped-a", "missing-d"],
      maxEntries: 4,
    });

    expect(result.evictedUtteranceIds).toEqual([]);
    expect(result.deletedDroppedUtteranceIds).toEqual(["dropped-a"]);
    expect([...meta.keys()]).toEqual(["kept-b", "new-c"]);
  });
});

describe("buildVoicePlaybackTimelineMeta", () => {
  it("combines task and assembler state into governed playback metadata", () => {
    expect(buildVoicePlaybackTimelineMeta({
      task: {
        briefSource: "llm",
        finalSource: "normal_reasoning",
        authority: "final",
        source: "workstation",
        replyId: "reply:test",
        interimVoiceRequestId: "request:test",
        interimVoiceReceiptId: "receipt:test",
        interimVoiceReceiptKey: "receipt-key:test",
        interimVoiceCalloutKind: "tool_result",
        revision: 3,
      },
      assemblerState: {
        hlcMs: 123,
        eventSeq: 7,
        sealToken: "seal:test",
      },
    })).toEqual({
      briefSource: "llm",
      finalSource: "normal_reasoning",
      authority: "final",
      source: "workstation",
      replyId: "reply:test",
      interimVoiceRequestId: "request:test",
      interimVoiceReceiptId: "receipt:test",
      interimVoiceReceiptKey: "receipt-key:test",
      interimVoiceCalloutKind: "tool_result",
      hlcMs: 123,
      seq: 7,
      revision: 3,
      sealToken: "seal:test",
    });
  });
});
