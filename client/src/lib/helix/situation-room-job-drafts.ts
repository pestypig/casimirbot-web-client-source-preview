import {
  getSituationRoomJobRecipe,
  type SituationRoomJobRecipe,
  type SituationRoomJobRecipeArgs,
  type SituationRoomJobRecipeId,
} from "@/lib/helix/situation-room-job-recipes";
import type {
  CreateJobInput,
  SituationRoomJobChunkRange,
  SituationRoomJobInputTextPolicy,
  SituationRoomJobOutputRenderPolicy,
} from "@/store/useSituationRoomJobStore";

export type SituationRoomJobDraftScope = {
  room_id: string;
  source_ids?: string[];
  selected_source_id?: string;
  chunk_ranges?: SituationRoomJobChunkRange[];
  source_label?: string;
};

export type DraftSituationRoomJobSpec = {
  draft_id: string;
  recipe_id: SituationRoomJobRecipeId;
  title: string;
  room_id: string;
  source_ids: string[];
  chunk_ranges?: SituationRoomJobChunkRange[];
  kind: CreateJobInput["kind"];
  args: CreateJobInput;
  confidence: number;
  missing_slots: string[];
  prompt_template: string;
  attachment_policy: "manual_only";
  context_injection: "explicit_attachment_only";
  command_lane_enabled: false;
};

const LANGUAGE_ALIASES: Record<string, string> = {
  spanish: "es",
  espanol: "es",
  es: "es",
  french: "fr",
  francais: "fr",
  fr: "fr",
  german: "de",
  deutsch: "de",
  de: "de",
  japanese: "ja",
  nihongo: "ja",
  ja: "ja",
  english: "en",
  en: "en",
};

const LANGUAGE_LABELS: Record<string, string> = {
  es: "Spanish",
  fr: "French",
  de: "German",
  ja: "Japanese",
  en: "English",
};

function draftId(recipeId: string, scope: SituationRoomJobDraftScope): string {
  return `draft:${recipeId}:${scope.room_id}:${scope.selected_source_id ?? scope.source_ids?.join(",") ?? "room"}`;
}

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function normalizeSituationRoomLanguage(value: string | undefined): string | undefined {
  const normalized = normalizeToken(value ?? "");
  if (!normalized) return undefined;
  return LANGUAGE_ALIASES[normalized] ?? normalized;
}

export function labelSituationRoomLanguage(value: string | undefined): string {
  const normalized = normalizeSituationRoomLanguage(value);
  return normalized ? LANGUAGE_LABELS[normalized] ?? normalized : "target language";
}

function parseTargetLanguage(text: string): string | undefined {
  const normalized = normalizeToken(text);
  const explicit = normalized.match(/\b(?:to|into|in)\s+([a-z]+)\b/);
  if (explicit) return normalizeSituationRoomLanguage(explicit[1]);
  for (const [alias, code] of Object.entries(LANGUAGE_ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`, "i").test(normalized)) return code;
  }
  return undefined;
}

function recipeIdFromNaturalLanguage(text: string): SituationRoomJobRecipeId | null {
  if (/\b(?:translate|translation)\b/i.test(text)) return "translate_source";
  if (/\b(?:action items?|todos?|to-dos?|follow ups?)\b/i.test(text)) return "extract_action_items";
  if (/\b(?:make|compose|create|draft).*\bprompt\b|\bprompt draft\b/i.test(text)) {
    return "compose_prompt_from_evidence";
  }
  if (/\b(?:compare|contrast)\b/i.test(text)) return "compare_selected_sources";
  if (/\b(?:summary|summarize|summarise|brief)\b/i.test(text)) return "rolling_room_brief";
  return null;
}

function cleanArgs(args: SituationRoomJobRecipeArgs): Partial<CreateJobInput> {
  return {
    target_language: typeof args.target_language === "string" ? args.target_language : undefined,
    native_language: typeof args.native_language === "string" ? args.native_language : undefined,
    input_text_policy: args.input_text_policy as SituationRoomJobInputTextPolicy | undefined,
    output_render_policy: args.output_render_policy as SituationRoomJobOutputRenderPolicy | undefined,
  };
}

function missingSlots(recipe: SituationRoomJobRecipe, args: Partial<CreateJobInput>): string[] {
  return recipe.required_slots.filter((slot) => {
    const value = (args as Record<string, unknown>)[slot];
    return typeof value !== "string" || !value.trim();
  });
}

function titleForDraft(recipe: SituationRoomJobRecipe, args: Partial<CreateJobInput>, scope: SituationRoomJobDraftScope) {
  if (recipe.recipe_id === "translate_source") {
    const language = labelSituationRoomLanguage(args.target_language);
    return `Translate ${scope.source_label ?? "source"} to ${language}`;
  }
  return recipe.title;
}

export function draftJobFromRecipe(
  recipe: SituationRoomJobRecipe,
  scope: SituationRoomJobDraftScope,
  overrides: Partial<CreateJobInput> = {},
): DraftSituationRoomJobSpec {
  const sourceIds = scope.selected_source_id
    ? [scope.selected_source_id]
    : Array.isArray(scope.source_ids)
      ? scope.source_ids
      : [];
  const mergedArgs: Partial<CreateJobInput> = {
    ...cleanArgs(recipe.default_args),
    ...overrides,
  };
  const missing = missingSlots(recipe, mergedArgs);
  const title = overrides.title ?? titleForDraft(recipe, mergedArgs, scope);
  return {
    draft_id: draftId(recipe.recipe_id, scope),
    recipe_id: recipe.recipe_id,
    title,
    room_id: scope.room_id,
    source_ids: sourceIds,
    chunk_ranges: scope.chunk_ranges,
    kind: recipe.kind,
    args: {
      room_id: scope.room_id,
      kind: recipe.kind,
      title,
      source_ids: sourceIds,
      chunk_ranges: scope.chunk_ranges,
      ...mergedArgs,
      attachment_policy: recipe.attachment_policy,
      context_injection: recipe.context_injection,
      command_lane_enabled: recipe.command_lane_enabled,
    },
    confidence: missing.length > 0 ? 0.55 : 0.88,
    missing_slots: missing,
    prompt_template: recipe.prompt_template,
    attachment_policy: recipe.attachment_policy,
    context_injection: recipe.context_injection,
    command_lane_enabled: recipe.command_lane_enabled,
  };
}

export function draftJobFromNaturalLanguage(
  text: string,
  scope: SituationRoomJobDraftScope,
): DraftSituationRoomJobSpec | null {
  const parsedLanguage = parseTargetLanguage(text);
  const recipeId = recipeIdFromNaturalLanguage(text) ?? (parsedLanguage ? "translate_source" : null);
  if (!recipeId) return null;
  const recipe = getSituationRoomJobRecipe(recipeId);
  const overrides: Partial<CreateJobInput> = {};
  if (recipeId === "translate_source") {
    overrides.target_language = parsedLanguage;
    if (/\bdual\b|\bbilingual\b|\bside by side\b/i.test(text)) {
      overrides.output_render_policy = "dual";
    }
  }
  return draftJobFromRecipe(recipe, scope, overrides);
}
