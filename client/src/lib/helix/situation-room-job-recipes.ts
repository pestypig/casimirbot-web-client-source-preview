import type {
  SituationRoomJobArtifactKind,
  SituationRoomJobInputTextPolicy,
  SituationRoomJobKind,
  SituationRoomJobOutputRenderPolicy,
} from "@/store/useSituationRoomJobStore";

export type SituationRoomJobRecipeId =
  | "translate_source"
  | "rolling_room_brief"
  | "extract_action_items"
  | "compose_prompt_from_evidence"
  | "compare_selected_sources";

export type SituationRoomJobRecipeScope = "selected_source" | "active_room" | "selected_chunks";

export type SituationRoomJobRecipeArgs = {
  target_language?: string;
  native_language?: string;
  input_text_policy?: SituationRoomJobInputTextPolicy;
  output_render_policy?: SituationRoomJobOutputRenderPolicy;
  window_chunks?: number;
  include_sources?: boolean;
  include_citations?: boolean;
  compare_mode?: "differences_and_agreements";
  [key: string]: unknown;
};

export type SituationRoomJobRecipe = {
  recipe_id: SituationRoomJobRecipeId;
  title: string;
  description: string;
  kind: SituationRoomJobKind;
  default_scope: SituationRoomJobRecipeScope;
  prompt_template: string;
  required_slots: string[];
  optional_slots: string[];
  default_args: SituationRoomJobRecipeArgs;
  output_artifact_kind: SituationRoomJobArtifactKind;
  attachment_policy: "manual_only";
  context_injection: "explicit_attachment_only";
  command_lane_enabled: false;
  tool: {
    namespace: "situation_room";
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    deferLoading: true;
  };
};

const manualOnlyPolicy = {
  attachment_policy: "manual_only",
  context_injection: "explicit_attachment_only",
  command_lane_enabled: false,
} as const;

const scopeSchema = {
  type: "object",
  properties: {
    room_id: { type: "string" },
    source_ids: { type: "array", items: { type: "string" } },
    chunk_ranges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source_id: { type: "string" },
          from_chunk: { type: "number" },
          to_chunk: { type: "number" },
        },
        required: ["source_id", "from_chunk", "to_chunk"],
      },
    },
  },
  required: ["room_id"],
};

export const SITUATION_ROOM_JOB_RECIPES: SituationRoomJobRecipe[] = [
  {
    recipe_id: "translate_source",
    title: "Translate source",
    description: "Translate selected transcript chunks into a target language without replacing the raw transcript.",
    kind: "translate",
    default_scope: "selected_source",
    prompt_template:
      "Translate selected transcript chunks into {{target_language}}. Preserve names, numbers, game terms, and speaker intent.",
    required_slots: ["target_language"],
    optional_slots: ["native_language", "input_text_policy", "output_render_policy"],
    default_args: {
      native_language: "en",
      input_text_policy: "source_text_preferred",
      output_render_policy: "target_language",
    },
    output_artifact_kind: "translation_chunk",
    ...manualOnlyPolicy,
    tool: {
      namespace: "situation_room",
      name: "translate_source",
      description: "Translate selected room/source transcript chunks.",
      inputSchema: {
        type: "object",
        properties: {
          scope: scopeSchema,
          target_language: { type: "string" },
          native_language: { type: "string" },
          output_render_policy: { enum: ["target_language", "native_language", "dual"] },
        },
        required: ["scope", "target_language"],
      },
      deferLoading: true,
    },
  },
  {
    recipe_id: "rolling_room_brief",
    title: "Rolling room brief",
    description: "Summarize selected room evidence into objective, decisions, risks, and open questions.",
    kind: "rolling_summary",
    default_scope: "active_room",
    prompt_template:
      "Summarize the selected room evidence into current objective, decisions, risks, and open questions.",
    required_slots: [],
    optional_slots: ["window_chunks", "native_language"],
    default_args: {
      window_chunks: 12,
      native_language: "en",
    },
    output_artifact_kind: "summary",
    ...manualOnlyPolicy,
    tool: {
      namespace: "situation_room",
      name: "rolling_room_brief",
      description: "Create a rolling summary from selected room evidence.",
      inputSchema: {
        type: "object",
        properties: { scope: scopeSchema, window_chunks: { type: "number" } },
        required: ["scope"],
      },
      deferLoading: true,
    },
  },
  {
    recipe_id: "extract_action_items",
    title: "Action items",
    description: "Extract todo-style follow-ups from selected live evidence.",
    kind: "action_items",
    default_scope: "active_room",
    prompt_template:
      "Extract action items from the selected room evidence. Keep each item tied to source chunks.",
    required_slots: [],
    optional_slots: ["native_language"],
    default_args: {
      native_language: "en",
    },
    output_artifact_kind: "action_item",
    ...manualOnlyPolicy,
    tool: {
      namespace: "situation_room",
      name: "extract_action_items",
      description: "Extract action items from selected Situation Room evidence.",
      inputSchema: {
        type: "object",
        properties: { scope: scopeSchema },
        required: ["scope"],
      },
      deferLoading: true,
    },
  },
  {
    recipe_id: "compose_prompt_from_evidence",
    title: "Prompt draft",
    description: "Compose a bounded Helix Ask prompt from selected room evidence and citations.",
    kind: "prompt_composer",
    default_scope: "selected_chunks",
    prompt_template:
      "Create a Helix Ask prompt using the selected live evidence. Include source labels and citation paths.",
    required_slots: [],
    optional_slots: ["include_sources", "include_citations"],
    default_args: {
      include_sources: true,
      include_citations: true,
      native_language: "en",
    },
    output_artifact_kind: "prompt_draft",
    ...manualOnlyPolicy,
    tool: {
      namespace: "situation_room",
      name: "compose_prompt_from_evidence",
      description: "Compose a prompt draft from selected live evidence.",
      inputSchema: {
        type: "object",
        properties: { scope: scopeSchema, include_citations: { type: "boolean" } },
        required: ["scope"],
      },
      deferLoading: true,
    },
  },
  {
    recipe_id: "compare_selected_sources",
    title: "Compare sources",
    description: "Create a prompt draft that compares selected sources while preserving provenance.",
    kind: "prompt_composer",
    default_scope: "selected_chunks",
    prompt_template:
      "Compare the selected room sources. Separate agreements, conflicts, missing context, and next questions.",
    required_slots: [],
    optional_slots: ["include_sources", "include_citations", "compare_mode"],
    default_args: {
      include_sources: true,
      include_citations: true,
      compare_mode: "differences_and_agreements",
      native_language: "en",
    },
    output_artifact_kind: "prompt_draft",
    ...manualOnlyPolicy,
    tool: {
      namespace: "situation_room",
      name: "compare_selected_sources",
      description: "Draft a comparison prompt from selected Situation Room sources.",
      inputSchema: {
        type: "object",
        properties: { scope: scopeSchema, compare_mode: { type: "string" } },
        required: ["scope"],
      },
      deferLoading: true,
    },
  },
];

export function getSituationRoomJobRecipe(recipeId: SituationRoomJobRecipeId): SituationRoomJobRecipe {
  const recipe = SITUATION_ROOM_JOB_RECIPES.find((candidate) => candidate.recipe_id === recipeId);
  if (!recipe) throw new Error(`unknown_situation_room_job_recipe:${recipeId}`);
  return recipe;
}
