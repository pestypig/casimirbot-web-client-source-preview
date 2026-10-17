/** @vitest-environment jsdom */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MissionBoardEvent, MissionBoardSnapshot } from "@/lib/mission-overwatch";
import {
  buildMissionGuideProjection,
  readMissionGuideBinding,
  recordMissionGuideBinding,
  releaseMissionGuideBinding,
  resetMissionGuideBindingForTest,
  useCasimirGuideMissionProjection,
  usePublishMissionGuideBinding,
  type MissionGuideBinding,
} from "../CasimirGuideMissionProjection";

const binding: MissionGuideBinding = {
  controller_available: true,
  mission_id: "mission:authoritative",
  context: {
    tier: "tier1",
    session_state: "active",
    voice_mode: "critical_only",
    mute_while_typing: true,
  },
};

const snapshot: MissionBoardSnapshot = {
  missionId: "mission:authoritative",
  phase: "verify",
  status: "degraded",
  updatedAt: "2026-09-01T12:03:00.000Z",
  unresolvedCritical: 1,
  objectives: [
    { objectiveId: "objective:open", title: "Secondary objective", status: "open", updatedAt: "2026-09-01T12:00:00.000Z" },
    { objectiveId: "objective:blocked", title: "Resolve the authoritative blocker", status: "blocked", updatedAt: "2026-09-01T12:01:00.000Z" },
  ],
};

const events: MissionBoardEvent[] = [
  {
    eventId: "event:attention-secret",
    missionId: "mission:authoritative",
    type: "action_required",
    classification: "critical",
    text: "Verification gate failed deterministically",
    ts: "2026-09-01T12:02:00.000Z",
    evidenceRefs: ["evidence:secret-a", "evidence:secret-b"],
    certaintyClass: "confirmed",
    failReason: "verification_gate_failed",
    suppressionReason: "critical_only_policy",
    lastVerifiedAt: "2026-09-01T12:01:59.000Z",
    traceId: "trace:secret-replay",
  },
  {
    eventId: "event:stale-window",
    missionId: "mission:authoritative",
    type: "timer_update",
    classification: "info",
    text: "Freshness window",
    ts: "2026-09-01T12:03:00.000Z",
    evidenceRefs: [],
    timerKind: "stale_window",
    timerStatus: "running",
    timerDueTs: "2026-09-01T12:05:00.000Z",
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
  resetMissionGuideBindingForTest();
});

describe("Casimir Guide mission projection", () => {
  it("preserves bounded mission semantics while redacting evidence, trace, and event identities", () => {
    const projection = buildMissionGuideProjection({
      binding,
      snapshot,
      events,
      nowMs: Date.parse("2026-09-01T12:04:00.000Z"),
    });

    expect(projection).toMatchObject({
      state: "ready",
      mission_id: "mission:authoritative",
      mission: {
        phase: "verify",
        status: "degraded",
        freshness: "fresh",
        last_verified_at: "2026-09-01T12:01:59.000Z",
        unresolved_critical: 1,
      },
      objective: { title: "Resolve the authoritative blocker", status: "blocked" },
      attention: {
        classification: "critical",
        certainty: "confirmed",
        fail_reason: "verification_gate_failed",
        suppression_reason: "critical_only_policy",
      },
      evidence: { reference_count: 2, trace_available: true, replay_available: true },
      voice: binding.context,
      terminal: { terminal_eligible: false, result_available: false },
      authority: {
        answer_authority: false,
        execution_authority: false,
        acknowledgment_authority: false,
        narration_authority: false,
        replay_authority: false,
      },
    });

    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain("event:attention-secret");
    expect(serialized).not.toContain("evidence:secret-a");
    expect(serialized).not.toContain("trace:secret-replay");
    expect(serialized).not.toContain("postMissionAction");
    expect(serialized).not.toContain("postMissionAck");
  });

  it("removes acknowledged attention and fails closed on implicit freshness or an empty board", () => {
    const acknowledged = buildMissionGuideProjection({
      binding,
      snapshot: { ...snapshot, status: "active", unresolvedCritical: 0 },
      events: [
        events[0],
        {
          eventId: "ack:event:attention-secret:1",
          missionId: binding.mission_id!,
          type: "state_change",
          classification: "info",
          text: "Acknowledged",
          ts: "2026-09-01T12:04:00.000Z",
          evidenceRefs: ["event:attention-secret"],
          derivedFromEventId: "event:attention-secret",
        },
      ],
      nowMs: Date.parse("2026-09-01T12:05:00.000Z"),
    });
    expect(acknowledged.attention).toBeNull();
    expect(acknowledged.mission?.freshness).toBe("unknown");
    expect(buildMissionGuideProjection({ binding, snapshot, events: [] })).toMatchObject({
      state: "none",
      mission_id: "mission:authoritative",
      mission: null,
    });
  });

  it("keeps publisher ownership deterministic when multiple Helix Ask surfaces exist", () => {
    const first = Symbol("first");
    const second = Symbol("second");
    recordMissionGuideBinding(first, binding);
    recordMissionGuideBinding(second, { ...binding, mission_id: "mission:newer" });
    releaseMissionGuideBinding(first);
    expect(readMissionGuideBinding().mission_id).toBe("mission:newer");
    releaseMissionGuideBinding(second);
    expect(readMissionGuideBinding().controller_available).toBe(false);
  });

  it("publishes and releases the mounted Helix Ask binding through the integration hook", async () => {
    const { rerender, unmount } = renderHook((props: {
      missionId: string;
      voiceMode: "normal" | "dnd";
    }) => usePublishMissionGuideBinding({
      missionId: props.missionId,
      tier: "tier1",
      sessionState: "active",
      voiceMode: props.voiceMode,
      muteWhileTyping: true,
    }), { initialProps: { missionId: "mission:hook", voiceMode: "normal" as const } });

    await waitFor(() => expect(readMissionGuideBinding()).toMatchObject({
      mission_id: "mission:hook",
      context: { voice_mode: "normal" },
    }));
    rerender({ missionId: "mission:hook", voiceMode: "dnd" });
    await waitFor(() => expect(readMissionGuideBinding().context.voice_mode).toBe("dnd"));
    unmount();
    expect(readMissionGuideBinding().controller_available).toBe(false);
  });

  it("retains a successful snapshot as stale when the next bounded refresh fails", async () => {
    let failing = false;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (failing) throw new Error("mission board unavailable");
      const url = String(input);
      return new Response(JSON.stringify(url.endsWith("/events?limit=200&tail=1")
        ? { events, nextCursor: null }
        : { snapshot }), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const owner = Symbol("hook");
    recordMissionGuideBinding(owner, binding);
    const { result } = renderHook(() => useCasimirGuideMissionProjection(true));
    await waitFor(() => expect(result.current.state).toBe("ready"));

    failing = true;
    act(() => recordMissionGuideBinding(owner, {
      ...binding,
      context: { ...binding.context, voice_mode: "dnd" },
    }));
    await waitFor(() => expect(result.current.state).toBe("stale"));
    expect(result.current.voice.voice_mode).toBe("dnd");
    expect(result.current.mission?.phase).toBe("verify");
  });
});
