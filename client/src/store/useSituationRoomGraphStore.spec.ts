import { beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).__HELIX_ASK_JOB_TIMEOUT_MS__ = "1200000";
import { HELIX_ASK_LIVE_EVENT_BUS_EVENT } from "@/lib/helix/liveEventsBus";
import { useSituationRoomGraphStore } from "@/store/useSituationRoomGraphStore";
import { useSituationRoomJobStore } from "@/store/useSituationRoomJobStore";
import { useSituationRoomStore, type SituationRoomSource } from "@/store/useSituationRoomStore";
import type { SituationGraphEdge, SituationGraphNode } from "@shared/helix-situation-graph";

vi.mock("@/lib/helix/display-audio-capture", () => ({
  startDisplayAudioSituationSession: vi.fn(),
}));
vi.mock("@/lib/helix/mic-audio-situation-capture", () => ({
  startMicAudioSituationSession: vi.fn(),
}));

function seedRoom() {
  const room = useSituationRoomStore.getState().createRoom("Graph Room");
  const source: SituationRoomSource = {
    source_id: "src_graph",
    room_id: room.room_id,
    label: "Room mic",
    capture_source: "mic",
    capture_session_id: "cap_graph",
    status: "active",
    chunk_index: 0,
    started_at: "2026-05-04T12:00:00.000Z",
  };
  useSituationRoomStore.setState((state: ReturnType<typeof useSituationRoomStore.getState>) => ({
    sources: { ...state.sources, [source.source_id]: source },
    rooms: {
      ...state.rooms,
      [room.room_id]: {
        ...room,
        source_ids: [source.source_id],
      },
    },
  }));
  return { room, source };
}

describe("useSituationRoomGraphStore", () => {
  beforeEach(() => {
    useSituationRoomStore.getState().reset();
    useSituationRoomJobStore.getState().reset();
    useSituationRoomGraphStore.getState().reset();
    vi.unstubAllGlobals();
  });

  it("creates a graph and connects static nodes", () => {
    const { room, source } = seedRoom();
    const graph = useSituationRoomGraphStore.getState().createGraph({
      room_id: room.room_id,
      title: "Static graph",
    });
    const sourceNode = useSituationRoomGraphStore.getState().addNode({
      graph_id: graph.graph_id,
      type: "source.audio.mic",
      title: source.label,
      source_id: source.source_id,
    });
    const bufferNode = useSituationRoomGraphStore.getState().addNode({
      graph_id: graph.graph_id,
      type: "transcript.buffer",
      title: "Transcript buffer",
    });
    const edge = useSituationRoomGraphStore.getState().connectNodes({
      graph_id: graph.graph_id,
      from_node_id: sourceNode!.node_id,
      to_node_id: bufferNode!.node_id,
      lane: "transcript",
    });

    const stored = useSituationRoomGraphStore.getState().graphs[graph.graph_id];
    expect(stored?.schema).toBe("helix.situation_graph.v1");
    expect(stored?.nodes).toHaveLength(2);
    expect(edge?.lane).toBe("transcript");
    expect(stored?.policies[0]?.config).toMatchObject({
      attachment_policy: "manual_only",
      context_injection: "explicit_attachment_only",
    });
  });

  it("creates a translation pair backed by two manual translate jobs", () => {
    const { room, source } = seedRoom();
    const result = useSituationRoomGraphStore.getState().createTranslationPair({
      room_id: room.room_id,
      speaker_a_id: "spk_user_1",
      speaker_b_id: "spk_rowan",
      speaker_a_native_language: "en",
      speaker_b_native_language: "es",
      source_ids: [source.source_id],
      render_policy: "dual",
    });

    expect(result?.job_ids).toHaveLength(2);
    const [aToB, bToA] = result!.job_ids.map((jobId: string) => useSituationRoomJobStore.getState().jobs[jobId]);
    expect(aToB).toMatchObject({
      kind: "translate",
      target_language: "es",
      native_language: "en",
      attachment_policy: "manual_only",
      context_injection: "explicit_attachment_only",
      command_lane_enabled: false,
    });
    expect(bToA).toMatchObject({
      kind: "translate",
      target_language: "en",
      native_language: "es",
    });
    expect(result?.node.config?.translation_pair).toMatchObject({
      speaker_a_id: "spk_user_1",
      speaker_b_id: "spk_rowan",
      a_to_b_job_id: result!.job_ids[0],
      b_to_a_job_id: result!.job_ids[1],
      voice_output: "off",
    });
  });

  it("creates a generic graph from a recipe and returns an execution receipt", () => {
    const { room, source } = seedRoom();
    const receipt = useSituationRoomGraphStore.getState().createGraphFromRecipe({
      recipe_id: "two_way_interpreter",
      room_id: room.room_id,
      source_ids: [source.source_id],
      bindings: {
        speaker_a_id: "spk_user_1",
        speaker_b_id: "spk_rowan",
        speaker_a_native_language: "en",
        speaker_b_native_language: "es",
        output_mode: "dual",
      },
      title: "Interpreter graph",
    });

    expect(receipt).toMatchObject({
      schema: "helix.situation_graph_execution_receipt.v1",
      ok: true,
      recipe_id: "two_way_interpreter",
      room_id: room.room_id,
      source_ids: [source.source_id],
      missing_bindings: [],
      attachment_policy: "manual_only",
      context_injection: "explicit_attachment_only",
      command_lane_enabled: false,
    });
    expect(receipt.node_ids.length).toBeGreaterThan(3);
    expect(receipt.edge_ids.length).toBeGreaterThan(3);
    expect(receipt.job_ids).toHaveLength(2);
    const graph = useSituationRoomGraphStore.getState().graphs[receipt.graph_id];
    expect(graph?.nodes.some((node: SituationGraphNode) => node.capability_id === "identity.speaker_split")).toBe(true);
    expect(graph?.nodes.some((node: SituationGraphNode) => node.capability_id === "monitor.translation_health")).toBe(true);
    expect(graph?.edges.some((edge: SituationGraphEdge) => edge.lane === "translation")).toBe(true);
    expect(receipt.job_ids.map((jobId: string) => useSituationRoomJobStore.getState().jobs[jobId]?.kind)).toEqual([
      "translate",
      "translate",
    ]);
  });

  it("validates missing recipe bindings without creating graph artifacts", () => {
    const { room, source } = seedRoom();
    const graphCount = Object.keys(useSituationRoomGraphStore.getState().graphs).length;
    const receipt = useSituationRoomGraphStore.getState().createGraphFromRecipe({
      recipe_id: "two_way_interpreter",
      room_id: room.room_id,
      source_ids: [source.source_id],
      bindings: {
        speaker_a_id: "spk_user_1",
      },
    });

    expect(receipt.ok).toBe(false);
    expect(receipt.missing_bindings).toEqual(
      expect.arrayContaining(["speaker_b_id", "speaker_a_native_language", "speaker_b_native_language", "output_mode"]),
    );
    expect(receipt.node_ids).toEqual([]);
    expect(Object.keys(useSituationRoomGraphStore.getState().graphs)).toHaveLength(graphCount);
  });

  it("creates standby monitor graphs from recipes without jobs or command lanes", () => {
    const { room, source } = seedRoom();
    const receipt = useSituationRoomGraphStore.getState().createGraphFromRecipe({
      recipe_id: "minecraft_world_monitor",
      room_id: room.room_id,
      source_ids: [source.source_id],
      bindings: {
        standby_mode: "game_master",
        world_id: "minecraft:local",
      },
    });

    expect(receipt).toMatchObject({
      ok: true,
      recipe_id: "minecraft_world_monitor",
      job_ids: [],
      attachment_policy: "manual_only",
      context_injection: "explicit_attachment_only",
      command_lane_enabled: false,
    });
    const graph = useSituationRoomGraphStore.getState().graphs[receipt.graph_id];
    expect(graph.nodes.some((node: SituationGraphNode) => node.capability_id === "monitor.salience_gate")).toBe(true);
    expect(graph.nodes.some((node: SituationGraphNode) => node.capability_id === "monitor.interjection_proposal")).toBe(true);
    expect(graph.edges.some((edge: SituationGraphEdge) => edge.lane === "monitor_signal")).toBe(true);
    expect(graph.edges.some((edge: SituationGraphEdge) => edge.lane === "command")).toBe(false);
  });

  it("attaches a graph snapshot to Helix Ask explicitly", () => {
    const received: unknown[] = [];
    const listeners = new Map<string, Set<(event: Event) => void>>();
    vi.stubGlobal(
      "CustomEvent",
      class {
        type: string;
        detail: unknown;
        constructor(type: string, init?: { detail?: unknown }) {
          this.type = type;
          this.detail = init?.detail;
        }
      },
    );
    vi.stubGlobal("window", {
      addEventListener: (type: string, listener: (event: Event) => void) => {
        const current = listeners.get(type) ?? new Set();
        current.add(listener);
        listeners.set(type, current);
      },
      removeEventListener: (type: string, listener: (event: Event) => void) => {
        listeners.get(type)?.delete(listener);
      },
      dispatchEvent: (event: Event) => {
        for (const listener of listeners.get(event.type) ?? []) listener(event);
        return true;
      },
    });
    const handler = (event: Event) => received.push((event as CustomEvent).detail);
    window.addEventListener(HELIX_ASK_LIVE_EVENT_BUS_EVENT, handler);
    const { room } = seedRoom();
    const graph = useSituationRoomGraphStore.getState().createGraph({ room_id: room.room_id });

    useSituationRoomGraphStore.getState().attachGraphToHelixAsk(graph.graph_id);

    expect(received[0]).toMatchObject({
      contextId: "helix-ask-desktop",
      entry: {
        tool: "situation-room.graph",
        meta: {
          kind: "situation_room_graph_attachment",
          attachment_policy: "manual_only",
          context_injection: "explicit_attachment_only",
        },
      },
    });
  });
});
