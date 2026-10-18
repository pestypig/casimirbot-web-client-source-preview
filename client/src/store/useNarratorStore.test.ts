import { beforeEach, describe, expect, it } from "vitest";
import { validateNarratorEventV1 } from "@shared/contracts/narrator-event.v1";
import { useNarratorStore } from "./useNarratorStore";

const initialState = useNarratorStore.getState();

describe("useNarratorStore", () => {
  beforeEach(() => {
    useNarratorStore.setState({
      ...initialState,
      events: [],
      queueState: {
        speaking: false,
        queuedEventIds: [],
        suppressedEventIds: [],
        lastSpokenByDedupeKey: {},
        lastSeenByDedupeKey: {},
        deliveryStatusByEventId: {},
        playbackDiagnosticsByEventId: {},
      },
    }, true);
  });

  it("publishes evidence-only narrator events", () => {
    const event = useNarratorStore.getState().publishEvent({
      sourceKind: "situation_room",
      sourceId: "situation-room:event:1",
      text: "A witness-only observation is ready.",
      authority: "panel_observation",
      assistant_answer: false,
      terminal_eligible: false,
      evidenceRefs: ["situation:event:1"],
      rawContentIncluded: false,
      speakable: true,
      requestedDeliveryMode: "confirm_to_speak",
      defaultDeliveryMode: "visible_only",
    }, { nowMs: 10 });

    expect(event).not.toBeNull();
    expect(useNarratorStore.getState().events).toHaveLength(1);
    expect(useNarratorStore.getState().events[0].assistant_answer).toBe(false);
  });

  it("normalizes durable goal-context refs for narrator events", () => {
    const event = useNarratorStore.getState().publishEvent({
      eventId: "narrator:event:goal-context",
      sourceKind: "live_answer",
      sourceId: "live-answer:translation-line:1",
      text: "Translation stream is ready for narrator review.",
      authority: "live_observation",
      assistant_answer: false,
      terminal_eligible: false,
      goalId: "goal:translation-monitor",
      goalContextUpdateId: "stage_play_goal_context_update:narrator:translation",
      evidenceRefs: ["translation_segment:latest"],
      rawContentIncluded: false,
      speakable: true,
      requestedDeliveryMode: "confirm_to_speak",
      defaultDeliveryMode: "visible_only",
    }, { nowMs: 20 });

    expect(event).not.toBeNull();
    expect(event?.evidenceRefs).toEqual(expect.arrayContaining([
      "translation_segment:latest",
      "stage_play_goal_context_update:narrator:translation",
    ]));
    expect(event?.producedRefs).toEqual([
      "narrator:event:goal-context",
      "stage_play_goal_context_update:narrator:translation",
    ]);
    expect(validateNarratorEventV1(event!)).toEqual([]);
  });

  it("drops duplicate narrator events inside the dedupe window", () => {
    const input = {
      sourceKind: "image_lens" as const,
      sourceId: "image-lens:event:1",
      text: "Repeated summary.",
      authority: "live_observation" as const,
      assistant_answer: false,
      terminal_eligible: false,
      evidenceRefs: ["image:event:1"],
      rawContentIncluded: false,
      speakable: true,
      requestedDeliveryMode: "confirm_to_speak" as const,
      defaultDeliveryMode: "visible_only" as const,
      dedupeKey: "image-lens:event:1",
    };
    expect(useNarratorStore.getState().publishEvent(input, { nowMs: 100 })).not.toBeNull();
    expect(useNarratorStore.getState().publishEvent(input, { nowMs: 200 })).toBeNull();
    expect(useNarratorStore.getState().events).toHaveLength(1);
  });

  it("uses a short duplicate window for hover focus inspector scanning", () => {
    useNarratorStore.getState().setSourcePolicy("hover_focus_inspector", {
      enabled: true,
      deliveryMode: "auto_speak",
    });
    const input = {
      sourceKind: "hover_focus_inspector" as const,
      sourceId: "hover:button:Speak narrator event",
      text: "Speak narrator event.",
      authority: "inspection_hint" as const,
      assistant_answer: false,
      terminal_eligible: false,
      evidenceRefs: ["hover:button:Speak narrator event"],
      rawContentIncluded: false,
      speakable: true,
      requestedDeliveryMode: "auto_speak" as const,
      defaultDeliveryMode: "visible_only" as const,
      dedupeKey: "hover_focus_inspector:hover:button:Speak narrator event",
    };

    expect(useNarratorStore.getState().publishEvent(input, { nowMs: 100 })).not.toBeNull();
    expect(useNarratorStore.getState().publishEvent(input, { nowMs: 200 })).toBeNull();
    expect(useNarratorStore.getState().publishEvent(input, { nowMs: 351 })).not.toBeNull();
    expect(useNarratorStore.getState().events).toHaveLength(2);
  });

  it("keeps voice receipts visible without queuing speech", () => {
    const event = useNarratorStore.getState().publishEvent({
      sourceKind: "voice_receipt",
      sourceId: "voice:receipt:1",
      text: "Playback delivered.",
      authority: "voice_receipt",
      assistant_answer: false,
      terminal_eligible: false,
      evidenceRefs: ["voice:receipt:1"],
      rawContentIncluded: false,
      speakable: true,
      requestedDeliveryMode: "auto_speak",
      defaultDeliveryMode: "visible_only",
    }, { voiceArmed: true, nowMs: 300 });

    expect(event).not.toBeNull();
    expect(useNarratorStore.getState().queueState.deliveryStatusByEventId[event?.eventId ?? ""]).toBe("visible");
  });

  it("records playback diagnostics with delivery state", () => {
    const event = useNarratorStore.getState().publishEvent({
      sourceKind: "workstation_panel",
      sourceId: "panel:narrator",
      text: "Playback diagnostic event.",
      authority: "panel_observation",
      assistant_answer: false,
      terminal_eligible: false,
      evidenceRefs: ["panel:narrator"],
      rawContentIncluded: false,
      speakable: true,
      requestedDeliveryMode: "auto_speak",
      defaultDeliveryMode: "visible_only",
    }, { voiceArmed: true, nowMs: 400 });

    expect(event).not.toBeNull();
    const diagnostic = {
      schema: "helix.voice_playback_lifecycle_diagnostic.v1" as const,
      stage: "ended" as const,
      startedAtMs: 400,
      updatedAtMs: 450,
      provider: "elevenlabs",
      profile: "vU0dJF9WOwsWEUfX1Aqw",
      mimeType: "audio/mpeg",
      audioBytes: 42,
      playResolved: true,
      playingObserved: true,
      endedObserved: true,
      timeupdateCount: 2,
      maxCurrentTime: 1.5,
      duration: 1.5,
      muted: false,
      volume: 1,
      paused: true,
      readyState: 4,
      networkState: 1,
      mediaErrorCode: null,
      errorMessage: null,
    };
    useNarratorStore.getState().markSpoken(event?.eventId ?? "", 450, diagnostic);

    expect(useNarratorStore.getState().queueState.deliveryStatusByEventId[event?.eventId ?? ""]).toBe("spoken");
    expect(useNarratorStore.getState().queueState.playbackDiagnosticsByEventId[event?.eventId ?? ""]).toMatchObject({
      stage: "ended",
      playResolved: true,
      playingObserved: true,
      endedObserved: true,
    });
  });

  it("tracks narrator read regions through voice loading and completion", () => {
    useNarratorStore.getState().setReadRegion({
      phase: "hover_pending",
      sourceId: "hover:button:read",
      textPreview: "Read this button.",
      rect: { left: 10, top: 20, width: 120, height: 40 },
      pointer: { x: 30, y: 35 },
      startedAtMs: 100,
      durationMs: 500,
    });

    expect(useNarratorStore.getState().readRegion).toMatchObject({
      visible: true,
      phase: "hover_pending",
      sourceId: "hover:button:read",
    });

    useNarratorStore.getState().markQueued("event:read-region");

    expect(useNarratorStore.getState().readRegion).toMatchObject({
      visible: true,
      eventId: "event:read-region",
      phase: "voice_loading",
    });

    useNarratorStore.getState().clearReadRegion("other-source");
    expect(useNarratorStore.getState().readRegion.visible).toBe(true);

    useNarratorStore.getState().markSpoken("event:read-region", 700);
    expect(useNarratorStore.getState().readRegion.visible).toBe(false);
  });
});
