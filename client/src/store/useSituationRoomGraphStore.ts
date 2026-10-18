import { create } from "zustand";
import { persist } from "zustand/middleware";
import { emitHelixAskLiveEvent } from "@/lib/helix/liveEventsBus";
import { HELIX_ASK_CONTEXT_ID } from "@/lib/helix/voice-surface-contract";
import { pushWorkstationDebugEvent } from "@/lib/helix/workstation-debug";
import { useSituationRoomJobStore } from "@/store/useSituationRoomJobStore";
import { getHelixGraphCapability, type HelixGraphCapability, type HelixGraphPortKind } from "@shared/helix-graph-capability";
import type {
  SituationGraphEdge,
  SituationGraphLane,
  SituationGraphNode,
  SituationGraphNodeColumn,
  SituationGraphNodeStatus,
  SituationGraphNodeType,
  SituationRoomGraphExecutionReceipt,
  SituationRoomGraph,
  TranslationPairNodeConfig,
} from "@shared/helix-situation-graph";
import {
  HELIX_SITUATION_GRAPH_EXECUTION_RECEIPT_SCHEMA,
  HELIX_SITUATION_GRAPH_SCHEMA,
} from "@shared/helix-situation-graph";
import { getHelixSituationGraphRecipe } from "@shared/helix-situation-graph-recipes";

const SITUATION_ROOM_GRAPH_STORAGE_KEY = "situation-room-graphs:v1";

type CreateGraphInput = {
  room_id: string;
  title?: string;
};

type AddNodeInput = {
  graph_id: string;
  type: SituationGraphNodeType;
  title: string;
  column?: SituationGraphNodeColumn;
  status?: SituationGraphNodeStatus;
  subtitle?: string;
  source_id?: string;
  speaker_id?: string;
  job_id?: string;
  output_id?: string;
  capability_id?: string;
  params?: Record<string, unknown>;
  param_schema?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

type ConnectNodesInput = {
  graph_id: string;
  from_node_id: string;
  from_port?: string;
  to_node_id: string;
  to_port?: string;
  lane: SituationGraphLane;
};

export type CreateTranslationPairInput = {
  graph_id?: string;
  room_id: string;
  speaker_a_id: string;
  speaker_b_id: string;
  speaker_a_native_language: string;
  speaker_b_native_language: string;
  source_ids?: string[];
  render_policy?: TranslationPairNodeConfig["render_policy"];
  voice_output?: TranslationPairNodeConfig["voice_output"];
  title?: string;
};

export type CreateGraphFromRecipeInput = {
  recipe_id: string;
  room_id?: string;
  source_ids?: string[];
  bindings?: Record<string, unknown>;
  title?: string;
};

type SituationRoomGraphStoreState = {
  graphs: Record<string, SituationRoomGraph>;
  graph_order: string[];
  active_graph_id_by_room: Record<string, string>;
  selected_node_id_by_graph: Record<string, string | undefined>;
  createGraph: (input: CreateGraphInput) => SituationRoomGraph;
  ensureGraphForRoom: (roomId: string, title?: string) => SituationRoomGraph;
  addNode: (input: AddNodeInput) => SituationGraphNode | null;
  connectNodes: (input: ConnectNodesInput) => SituationGraphEdge | null;
  createTranslationPair: (input: CreateTranslationPairInput) => {
    graph: SituationRoomGraph;
    node: SituationGraphNode;
    job_ids: [string, string];
  } | null;
  createGraphFromRecipe: (input: CreateGraphFromRecipeInput) => SituationRoomGraphExecutionReceipt;
  attachGraphToHelixAsk: (graphId: string) => void;
  setSelectedNode: (graphId: string, nodeId?: string) => void;
  reset: () => void;
};

const nowIso = (): string => new Date().toISOString();

const createId = (prefix: string): string => {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}:${Date.now()}:${random}`;
};

const defaultColumnForNodeType = (type: SituationGraphNodeType): SituationGraphNodeColumn => {
  if (type.startsWith("source.")) return "sources";
  if (type.startsWith("speaker.")) return "speakers";
  if (type === "translate" || type === "language.detect" || type === "transcript.buffer") return "jobs";
  if (type.startsWith("output.")) return "outputs";
  return "helix";
};

const graphNodeTypeForCapability = (capabilityId: string, capability?: HelixGraphCapability): SituationGraphNodeType => {
  if (capabilityId === "source.mic_audio") return "source.audio.mic";
  if (capabilityId === "source.screen_summary" || capabilityId === "source.minecraft_events") return "source.screen";
  if (capabilityId.startsWith("source.")) return "source.audio.display";
  if (capabilityId === "identity.speaker_profile_map" || capabilityId === "identity.speaker_split") return "speaker.identity";
  if (capabilityId === "policy.unknown_speaker_filter") return "speaker.filter";
  if (capabilityId === "policy.interjection_gate") return "helix.interjection_gate";
  if (capabilityId === "transform.language_detect") return "language.detect";
  if (capabilityId === "transform.translate") return "translate";
  if (capabilityId.startsWith("transform.")) return "transcript.buffer";
  if (capabilityId === "output.voice_on_confirm") return "output.voice";
  if (capabilityId === "output.note") return "output.note";
  if (capabilityId.startsWith("output.")) return "output.panel";
  if (capability?.family === "monitor" || capability?.family === "helix_bridge") return "helix.reason";
  return "helix.reason";
};

const laneForPortKind = (kind?: HelixGraphPortKind): SituationGraphLane => {
  if (kind === "audio") return "audio";
  if (kind === "speaker_identity") return "speaker_identity";
  if (kind === "translation" || kind === "language") return "translation";
  if (kind === "context") return "context";
  if (kind === "command") return "command";
  if (kind === "voice_output") return "voice_output";
  if (kind === "receipt") return "receipt";
  if (kind === "monitor_signal") return "monitor_signal";
  return "transcript";
};

const jobKindForCapability = (capabilityId: string): "translate" | "rolling_summary" | "action_items" | "prompt_composer" | null => {
  if (capabilityId === "transform.translate") return "translate";
  if (capabilityId === "transform.rolling_summary") return "rolling_summary";
  if (capabilityId === "transform.action_items") return "action_items";
  if (capabilityId === "transform.prompt_composer") return "prompt_composer";
  return null;
};

const asStringBinding = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const asStringArrayBinding = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];

const hasBindingValue = (value: unknown): boolean => {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined;
};

const edgeId = (input: Omit<ConnectNodesInput, "graph_id">): string =>
  `edge:${input.from_node_id}:${input.from_port ?? "out"}:${input.to_node_id}:${input.to_port ?? "in"}:${input.lane}`;

const upsertNode = (graph: SituationRoomGraph, node: SituationGraphNode): SituationRoomGraph => ({
  ...graph,
  nodes: [...graph.nodes.filter((entry) => entry.node_id !== node.node_id), node],
  updated_at: nowIso(),
});

const upsertEdge = (graph: SituationRoomGraph, edge: SituationGraphEdge): SituationRoomGraph => ({
  ...graph,
  edges: [...graph.edges.filter((entry) => entry.edge_id !== edge.edge_id), edge],
  updated_at: nowIso(),
});

export const useSituationRoomGraphStore = create<SituationRoomGraphStoreState>()(
  persist(
    (set, get) => ({
      graphs: {},
      graph_order: [],
      active_graph_id_by_room: {},
      selected_node_id_by_graph: {},
      createGraph: (input) => {
        const timestamp = nowIso();
        const graph: SituationRoomGraph = {
          schema: HELIX_SITUATION_GRAPH_SCHEMA,
          graph_id: createId("sgraph"),
          room_id: input.room_id,
          title: input.title?.trim() || "Situation Room Graph",
          nodes: [],
          edges: [],
          policies: [
            {
              policy_id: "policy:context_attachment",
              kind: "context_attachment",
              config: {
                attachment_policy: "manual_only",
                context_injection: "explicit_attachment_only",
              },
            },
            {
              policy_id: "policy:unknown_speaker",
              kind: "unknown_speaker",
              config: {
                behavior: "transcribe_only",
              },
            },
          ],
          created_at: timestamp,
          updated_at: timestamp,
        };
        set((state) => ({
          graphs: { ...state.graphs, [graph.graph_id]: graph },
          graph_order: [graph.graph_id, ...state.graph_order.filter((entry) => entry !== graph.graph_id)],
          active_graph_id_by_room: {
            ...state.active_graph_id_by_room,
            [graph.room_id]: graph.graph_id,
          },
        }));
        return graph;
      },
      ensureGraphForRoom: (roomId, title) => {
        const state = get();
        const activeGraphId = state.active_graph_id_by_room[roomId];
        if (activeGraphId && state.graphs[activeGraphId]) return state.graphs[activeGraphId];
        const existingGraphId = state.graph_order.find((graphId) => state.graphs[graphId]?.room_id === roomId);
        if (existingGraphId && state.graphs[existingGraphId]) {
          set((current) => ({
            active_graph_id_by_room: {
              ...current.active_graph_id_by_room,
              [roomId]: existingGraphId,
            },
          }));
          return state.graphs[existingGraphId];
        }
        return get().createGraph({ room_id: roomId, title });
      },
      addNode: (input) => {
        const graph = get().graphs[input.graph_id];
        if (!graph) return null;
        const timestamp = nowIso();
        const node: SituationGraphNode = {
          node_id: createId("node"),
          type: input.type,
          title: input.title,
          column: input.column ?? defaultColumnForNodeType(input.type),
          status: input.status ?? "idle",
          subtitle: input.subtitle,
          source_id: input.source_id,
          speaker_id: input.speaker_id,
          job_id: input.job_id,
          output_id: input.output_id,
          capability_id: input.capability_id,
          params: input.params,
          param_schema: input.param_schema,
          config: input.config,
          created_at: timestamp,
          updated_at: timestamp,
        };
        set((state) => ({
          graphs: {
            ...state.graphs,
            [graph.graph_id]: upsertNode(graph, node),
          },
        }));
        return node;
      },
      connectNodes: (input) => {
        const graph = get().graphs[input.graph_id];
        if (!graph) return null;
        if (!graph.nodes.some((node) => node.node_id === input.from_node_id)) return null;
        if (!graph.nodes.some((node) => node.node_id === input.to_node_id)) return null;
        const edge: SituationGraphEdge = {
          edge_id: edgeId(input),
          from_node_id: input.from_node_id,
          from_port: input.from_port ?? "out",
          to_node_id: input.to_node_id,
          to_port: input.to_port ?? "in",
          lane: input.lane,
        };
        set((state) => ({
          graphs: {
            ...state.graphs,
            [graph.graph_id]: upsertEdge(graph, edge),
          },
        }));
        return edge;
      },
      createTranslationPair: (input) => {
        const graph = input.graph_id && get().graphs[input.graph_id]
          ? get().graphs[input.graph_id]
          : get().ensureGraphForRoom(input.room_id, input.title ?? "Translation graph");
        const renderPolicy = input.render_policy ?? "dual";
        const voiceOutput = input.voice_output ?? "off";
        const jobState = useSituationRoomJobStore.getState();
        const aToB = jobState.createJob({
          room_id: input.room_id,
          kind: "translate",
          title: `${input.speaker_a_id} to ${input.speaker_b_native_language}`,
          source_ids: input.source_ids ?? [],
          target_language: input.speaker_b_native_language,
          native_language: input.speaker_a_native_language,
          input_text_policy: "source_text_preferred",
          output_render_policy: renderPolicy,
          attachment_policy: "manual_only",
          context_injection: "explicit_attachment_only",
          command_lane_enabled: false,
        });
        const bToA = jobState.createJob({
          room_id: input.room_id,
          kind: "translate",
          title: `${input.speaker_b_id} to ${input.speaker_a_native_language}`,
          source_ids: input.source_ids ?? [],
          target_language: input.speaker_a_native_language,
          native_language: input.speaker_b_native_language,
          input_text_policy: "source_text_preferred",
          output_render_policy: renderPolicy,
          attachment_policy: "manual_only",
          context_injection: "explicit_attachment_only",
          command_lane_enabled: false,
        });
        const timestamp = nowIso();
        const config: TranslationPairNodeConfig = {
          speaker_a_id: input.speaker_a_id,
          speaker_b_id: input.speaker_b_id,
          speaker_a_native_language: input.speaker_a_native_language,
          speaker_b_native_language: input.speaker_b_native_language,
          a_to_b_job_id: aToB.job_id,
          b_to_a_job_id: bToA.job_id,
          render_policy: renderPolicy,
          voice_output: voiceOutput,
        };
        const node: SituationGraphNode = {
          node_id: createId("node:translation_pair"),
          type: "translate",
          title: input.title?.trim() || "Two-way translation pair",
          column: "jobs",
          status: "idle",
          subtitle: `${input.speaker_a_native_language} <-> ${input.speaker_b_native_language}`,
          capability_id: "transform.translate",
          params: {
            speaker_a_id: input.speaker_a_id,
            speaker_b_id: input.speaker_b_id,
            output_mode: renderPolicy,
            voice_output: voiceOutput,
          },
          param_schema: getHelixGraphCapability("transform.translate")?.parameter_schema,
          config: { translation_pair: config },
          runtime: {
            event_count: 0,
            output_count: 0,
            last_error: null,
            last_updated_at: timestamp,
          },
          created_at: timestamp,
          updated_at: timestamp,
        };
        const speakerA: SituationGraphNode = {
          node_id: createId("node:speaker"),
          type: "speaker.identity",
          title: input.speaker_a_id,
          column: "speakers",
          status: "idle",
          speaker_id: input.speaker_a_id,
          subtitle: input.speaker_a_native_language,
          capability_id: "identity.speaker_profile_map",
          params: { speaker_id: input.speaker_a_id, native_language: input.speaker_a_native_language },
          param_schema: getHelixGraphCapability("identity.speaker_profile_map")?.parameter_schema,
          config: { native_language: input.speaker_a_native_language, authority: "transcribe_only" },
          runtime: {
            event_count: 0,
            output_count: 0,
            last_error: null,
            last_updated_at: timestamp,
          },
          created_at: timestamp,
          updated_at: timestamp,
        };
        const speakerB: SituationGraphNode = {
          node_id: createId("node:speaker"),
          type: "speaker.identity",
          title: input.speaker_b_id,
          column: "speakers",
          status: "idle",
          speaker_id: input.speaker_b_id,
          subtitle: input.speaker_b_native_language,
          capability_id: "identity.speaker_profile_map",
          params: { speaker_id: input.speaker_b_id, native_language: input.speaker_b_native_language },
          param_schema: getHelixGraphCapability("identity.speaker_profile_map")?.parameter_schema,
          config: { native_language: input.speaker_b_native_language, authority: "transcribe_only" },
          runtime: {
            event_count: 0,
            output_count: 0,
            last_error: null,
            last_updated_at: timestamp,
          },
          created_at: timestamp,
          updated_at: timestamp,
        };
        let nextGraph = upsertNode(upsertNode(upsertNode(graph, speakerA), speakerB), node);
        nextGraph = upsertEdge(nextGraph, {
          edge_id: edgeId({
            from_node_id: speakerA.node_id,
            to_node_id: node.node_id,
            lane: "speaker_identity",
          }),
          from_node_id: speakerA.node_id,
          from_port: "speaker",
          to_node_id: node.node_id,
          to_port: "speaker_a",
          lane: "speaker_identity",
        });
        nextGraph = upsertEdge(nextGraph, {
          edge_id: edgeId({
            from_node_id: speakerB.node_id,
            to_node_id: node.node_id,
            lane: "speaker_identity",
          }),
          from_node_id: speakerB.node_id,
          from_port: "speaker",
          to_node_id: node.node_id,
          to_port: "speaker_b",
          lane: "speaker_identity",
        });
        set((state) => ({
          graphs: { ...state.graphs, [graph.graph_id]: nextGraph },
          active_graph_id_by_room: {
            ...state.active_graph_id_by_room,
            [graph.room_id]: graph.graph_id,
          },
          selected_node_id_by_graph: {
            ...state.selected_node_id_by_graph,
            [graph.graph_id]: node.node_id,
          },
        }));
        pushWorkstationDebugEvent({
          channel: "situation_room_graph",
          action: "translation_pair_created",
          room_id: input.room_id,
          detail: {
            graph_id: graph.graph_id,
            node_id: node.node_id,
            job_ids: [aToB.job_id, bToA.job_id],
            attachment_policy: "manual_only",
            context_injection: "explicit_attachment_only",
          },
        });
        return { graph: nextGraph, node, job_ids: [aToB.job_id, bToA.job_id] };
      },
      createGraphFromRecipe: (input) => {
        const recipe = getHelixSituationGraphRecipe(input.recipe_id);
        const bindings: Record<string, unknown> = {
          ...(input.bindings ?? {}),
        };
        if (input.room_id) bindings.room_id = input.room_id;
        if (input.source_ids) bindings.source_ids = input.source_ids;
        const sourceIds = asStringArrayBinding(bindings.source_ids);
        const missingBindings = recipe
          ? recipe.required_bindings.filter((bindingKey) => !hasBindingValue(bindings[bindingKey]))
          : ["recipe_id"];
        if (!recipe || missingBindings.length > 0) {
          return {
            schema: HELIX_SITUATION_GRAPH_EXECUTION_RECEIPT_SCHEMA,
            ok: false,
            graph_id: "",
            recipe_id: input.recipe_id || null,
            room_id: asStringBinding(bindings.room_id) ?? null,
            source_ids: sourceIds,
            node_ids: [],
            edge_ids: [],
            job_ids: [],
            missing_bindings: missingBindings,
            attachment_policy: "manual_only",
            context_injection: "explicit_attachment_only",
            command_lane_enabled: false,
            error: recipe ? "recipe_bindings_missing" : "unknown_recipe",
          };
        }

        const roomId = asStringBinding(bindings.room_id) ?? "room:default";
        const graph = get().createGraph({
          room_id: roomId,
          title: input.title?.trim() || recipe.title,
        });
        const timestamp = nowIso();
        const jobState = useSituationRoomJobStore.getState();
        const localNodeIds: Record<string, string> = {};
        const nodeIds: string[] = [];
        const edgeIds: string[] = [];
        const jobIds: string[] = [];
        let nextGraph = graph;

        for (const recipeNode of recipe.nodes) {
          const capability = getHelixGraphCapability(recipeNode.capability_id);
          const type = graphNodeTypeForCapability(recipeNode.capability_id, capability);
          const jobKind = jobKindForCapability(recipeNode.capability_id);
          let jobId: string | undefined;
          const params = {
            ...(capability?.default_params ?? {}),
            ...(recipeNode.params ?? {}),
            ...bindings,
          };
          if (jobKind) {
            const targetLanguage =
              recipeNode.local_id === "translate_a_to_b"
                ? asStringBinding(bindings.speaker_b_native_language)
                : recipeNode.local_id === "translate_b_to_a"
                  ? asStringBinding(bindings.speaker_a_native_language)
                  : asStringBinding(bindings.target_language);
            const nativeLanguage =
              recipeNode.local_id === "translate_a_to_b"
                ? asStringBinding(bindings.speaker_a_native_language)
                : recipeNode.local_id === "translate_b_to_a"
                  ? asStringBinding(bindings.speaker_b_native_language)
                  : asStringBinding(bindings.native_language);
            const job = jobState.createJob({
              room_id: roomId,
              kind: jobKind,
              title: recipeNode.title ?? capability?.title ?? jobKind,
              source_ids: sourceIds,
              target_language: targetLanguage,
              native_language: nativeLanguage,
              input_text_policy: "source_text_preferred",
              output_render_policy: asStringBinding(bindings.output_mode) === "dual" ? "dual" : "target_language",
              attachment_policy: "manual_only",
              context_injection: "explicit_attachment_only",
              command_lane_enabled: false,
            });
            jobId = job.job_id;
            jobIds.push(job.job_id);
          }
          const node: SituationGraphNode = {
            node_id: createId(`node:${recipeNode.local_id}`),
            type,
            title: recipeNode.title ?? capability?.title ?? recipeNode.capability_id,
            column: defaultColumnForNodeType(type),
            status: "idle",
            subtitle: capability?.family ?? recipeNode.capability_id,
            job_id: jobId,
            source_id: type.startsWith("source.") ? sourceIds[0] : undefined,
            capability_id: recipeNode.capability_id,
            params,
            param_schema: capability?.parameter_schema,
            config: {
              recipe_id: recipe.recipe_id,
              local_id: recipeNode.local_id,
              attachment_policy: "manual_only",
              context_injection: "explicit_attachment_only",
              command_lane_enabled: false,
            },
            runtime: {
              event_count: 0,
              input_count: 0,
              output_count: 0,
              error_count: 0,
              last_error: null,
              last_updated_at: timestamp,
              status_text: "ready",
            },
            created_at: timestamp,
            updated_at: timestamp,
          };
          localNodeIds[recipeNode.local_id] = node.node_id;
          nodeIds.push(node.node_id);
          nextGraph = upsertNode(nextGraph, node);
        }

        for (const recipeEdge of recipe.edges) {
          const fromNodeId = localNodeIds[recipeEdge.from];
          const toNodeId = localNodeIds[recipeEdge.to];
          if (!fromNodeId || !toNodeId) continue;
          const fromRecipeNode = recipe.nodes.find((node) => node.local_id === recipeEdge.from);
          const fromCapability = fromRecipeNode ? getHelixGraphCapability(fromRecipeNode.capability_id) : undefined;
          const portKind = fromCapability?.output_ports.find((port) => port.port_id === recipeEdge.from_port)?.kind;
          const edge: SituationGraphEdge = {
            edge_id: edgeId({
              from_node_id: fromNodeId,
              from_port: recipeEdge.from_port,
              to_node_id: toNodeId,
              to_port: recipeEdge.to_port,
              lane: laneForPortKind(portKind),
            }),
            from_node_id: fromNodeId,
            from_port: recipeEdge.from_port,
            to_node_id: toNodeId,
            to_port: recipeEdge.to_port,
            lane: laneForPortKind(portKind),
          };
          edgeIds.push(edge.edge_id);
          nextGraph = upsertEdge(nextGraph, edge);
        }

        set((state) => ({
          graphs: { ...state.graphs, [graph.graph_id]: nextGraph },
          active_graph_id_by_room: {
            ...state.active_graph_id_by_room,
            [roomId]: graph.graph_id,
          },
          selected_node_id_by_graph: {
            ...state.selected_node_id_by_graph,
            [graph.graph_id]: nodeIds[0],
          },
        }));
        pushWorkstationDebugEvent({
          channel: "situation_room_graph",
          action: "graph_recipe_created",
          room_id: roomId,
          detail: {
            graph_id: graph.graph_id,
            recipe_id: recipe.recipe_id,
            node_ids: nodeIds,
            edge_ids: edgeIds,
            job_ids: jobIds,
            attachment_policy: "manual_only",
            context_injection: "explicit_attachment_only",
          },
        });
        return {
          schema: HELIX_SITUATION_GRAPH_EXECUTION_RECEIPT_SCHEMA,
          ok: true,
          graph_id: graph.graph_id,
          recipe_id: recipe.recipe_id,
          room_id: roomId,
          source_ids: sourceIds,
          node_ids: nodeIds,
          edge_ids: edgeIds,
          job_ids: jobIds,
          missing_bindings: [],
          attachment_policy: "manual_only",
          context_injection: "explicit_attachment_only",
          command_lane_enabled: false,
          error: null,
        };
      },
      attachGraphToHelixAsk: (graphId) => {
        const graph = get().graphs[graphId];
        if (!graph) return;
        emitHelixAskLiveEvent({
          contextId: HELIX_ASK_CONTEXT_ID.desktop,
          traceId: graph.room_id,
          entry: {
            id: `situation-room-graph-attached:${graphId}:${Date.now()}`,
            text: `attached situation room graph "${graph.title}" with ${graph.nodes.length} node(s) and ${graph.edges.length} edge(s)`,
            tool: "situation-room.graph",
            ts: nowIso(),
            meta: {
              kind: "situation_room_graph_attachment",
              graph,
              attachment_policy: "manual_only",
              context_injection: "explicit_attachment_only",
            },
          },
        });
      },
      setSelectedNode: (graphId, nodeId) =>
        set((state) => ({
          selected_node_id_by_graph: {
            ...state.selected_node_id_by_graph,
            [graphId]: nodeId,
          },
        })),
      reset: () =>
        set({
          graphs: {},
          graph_order: [],
          active_graph_id_by_room: {},
          selected_node_id_by_graph: {},
        }),
    }),
    {
      name: SITUATION_ROOM_GRAPH_STORAGE_KEY,
      partialize: (state) => ({
        graphs: state.graphs,
        graph_order: state.graph_order,
        active_graph_id_by_room: state.active_graph_id_by_room,
        selected_node_id_by_graph: state.selected_node_id_by_graph,
      }),
    },
  ),
);
