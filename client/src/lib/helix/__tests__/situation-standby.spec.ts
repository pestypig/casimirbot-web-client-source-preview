import { beforeEach, describe, expect, it } from "vitest";
import { buildSituationEventSignal } from "@/lib/helix/situation-standby-signals";
import { evaluateSituationSalience } from "@/lib/helix/situation-salience-gate";
import { useSituationStandbyStore } from "@/store/useSituationStandbyStore";
import { signalFromWorldEvent } from "@/lib/helix/situation-standby-signals";
import type { HelixWorldEvent } from "@shared/helix-world-event";

describe("situation standby salience", () => {
  beforeEach(() => {
    useSituationStandbyStore.getState().reset();
  });

  it("emits the first direct-address signal and dedupes the second", () => {
    const signal = buildSituationEventSignal({
      room_id: "room:standby",
      graph_id: "graph:standby",
      source: "voice_transcript",
      event_type: "direct_address",
      text: "Helix, what now?",
      evidence_refs: ["voice:1"],
      ts: "2026-05-05T12:00:00.000Z",
    });
    const first = evaluateSituationSalience({
      mode: "direct_address_only",
      room_id: "room:standby",
      graph_id: "graph:standby",
      signals: [signal],
      nowMs: Date.parse(signal.ts),
      memory: { last_emit_by_dedupe_key: {}, last_emit_by_room: {} },
    });
    expect(first.status).toBe("emit");
    expect(first.receipt.should_notify_helix).toBe(true);
    const second = evaluateSituationSalience({
      mode: "direct_address_only",
      room_id: "room:standby",
      graph_id: "graph:standby",
      signals: [signal],
      nowMs: Date.parse(signal.ts) + 1000,
      memory: {
        last_emit_by_dedupe_key: { [first.receipt.dedupe_key]: Date.parse(signal.ts) },
        last_emit_by_room: { "room:standby": Date.parse(signal.ts) },
      },
    });
    expect(second.status).toBe("dedupe_cooldown");
    expect(second.receipt.should_notify_helix).toBe(false);
  });

  it("suppresses non-addressed info in direct-address mode", () => {
    const signal = buildSituationEventSignal({
      room_id: "room:standby",
      source: "graph_runtime",
      event_type: "heartbeat",
      text: "Routine source activity.",
    });
    const decision = evaluateSituationSalience({
      mode: "direct_address_only",
      room_id: "room:standby",
      signals: [signal],
      memory: { last_emit_by_dedupe_key: {}, last_emit_by_room: {} },
    });
    expect(decision.status).toBe("mode_suppressed");
    expect(decision.receipt.reason).toBe("context_ineligible");
  });

  it("builds a Minecraft goal hypothesis and risk receipt through the store", () => {
    useSituationStandbyStore.getState().setMode("room:mc", "graph:mc", "game_master");
    const worldEvent: HelixWorldEvent = {
      schema: "helix.world_event.v1",
      world_id: "minecraft:local",
      room_id: "room:mc",
      source_id: "src:mc",
      ts: "2026-05-05T12:01:00.000Z",
      actor_id: "player:dan",
      actor_label: "Dan",
      event_type: "damage_taken",
      text: "Low health near blaze spawner after entering fortress.",
      health_delta: { current: 4 },
      evidence_refs: ["world:31"],
    };
    const result = useSituationStandbyStore.getState().ingestSignal(signalFromWorldEvent(worldEvent, "graph:mc"));
    const key = "room:mc:graph:mc";
    expect(result.receipt.reason).toBe("risk_detected");
    expect(result.receipt.should_notify_helix).toBe(true);
    expect(useSituationStandbyStore.getState().projection_by_key[key]?.world_state?.health_risk).toBe(true);
    expect(useSituationStandbyStore.getState().goals_by_key[key]?.[0]).toMatchObject({
      goal_label: "collect blaze rods",
    });
  });
});

