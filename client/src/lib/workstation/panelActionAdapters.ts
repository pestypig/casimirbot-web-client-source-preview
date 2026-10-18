import { openDocPanel } from "@/lib/docs/openDocPanel";
import { DOC_MANIFEST, findDocEntry } from "@/lib/docs/docManifest";
import { getPanelDef } from "@/lib/desktop/panelRegistry";
import type { SettingsTab } from "@/hooks/useHelixStartSettings";
import { pushWorkstationDebugEvent } from "@/lib/helix/workstation-debug";
import { writeInterfaceLanguagePreference } from "@/lib/i18n/interfaceLanguagePreference";
import { SHARED_INTERFACE_LANGUAGE_CODES } from "@shared/interface-language-codes";
import {
  SCIENTIFIC_CALCULATOR_DRAFT_KEY,
  dispatchScientificCalculatorMathPicked,
} from "@/lib/scientific-calculator/events";
import {
  buildScientificCalculatorDebugSnapshot,
  formatScientificCalculatorDebugLog,
} from "@/lib/scientific-calculator/debugLog";
import { runScientificSolve, type ScientificSolveResult } from "@/lib/scientific-calculator/solver";
import { runTheoryBadgePlaybackNow } from "@/lib/theory/theoryBadgePlaybackRunner";
import { readTheoryBadgeGraphAskContextSnapshot } from "@/lib/theory/theoryBadgeGraphAskContext";
import { runTheoryCompoundRunNow, type TheoryCompoundRunSolveScope } from "@/lib/theory/runTheoryCompoundRunNow";
import { solveTheoryCalculatorLoadoutNow } from "@/lib/theory/theoryCalculatorLoadoutRunner";
import { runImageLensFocusRun } from "@/lib/helix/imageLensFocusRun";
import { buildTheoryBadgeLocatorArtifact } from "@/lib/theory/theoryMapOverlay";
import { runClientTheoryContextReflectionTool } from "@/lib/workstation/theoryContextReflectionToolAdapter";
import { runStarSimRuntimeBadge } from "@shared/theory/starsim-runtime-adapter";
import { recordClipboardReceipt } from "@/lib/workstation/workstationClipboard";
import { useDocViewerStore } from "@/store/useDocViewerStore";
import { useScientificCalculatorStore } from "@/store/useScientificCalculatorStore";
import { useScientificCalculatorLiveSourceStore } from "@/store/useScientificCalculatorLiveSourceStore";
import { useTheoryBadgeGraphPanelStore } from "@/store/useTheoryBadgeGraphPanelStore";
import { useTheoryCompoundRunStore } from "@/store/useTheoryCompoundRunStore";
import { useTheoryMapOverlayStore } from "@/store/useTheoryMapOverlayStore";
import {
  useSituationRoomStore,
  selectSituationRoomEvents,
  type SituationRoom,
  type SituationRoomSource,
} from "@/store/useSituationRoomStore";
import {
  useSituationRoomJobStore,
  type SituationRoomJobKind,
  type SituationRoomJobInputTextPolicy,
  type SituationRoomJobOutputRenderPolicy,
} from "@/store/useSituationRoomJobStore";
import { useSituationRoomGraphStore } from "@/store/useSituationRoomGraphStore";
import {
  normalizeSituationRoomSetupActionArgs,
  setupSituationRoomFromPrompt,
} from "@/lib/workstation/situationRoomSetupActions";
import { useWorkstationClipboardStore } from "@/store/useWorkstationClipboardStore";
import { useWorkstationSessionMemoryStore } from "@/store/useWorkstationSessionMemoryStore";
import { useNarratorStore } from "@/store/useNarratorStore";
import { useWorkstationNotesStore } from "@/store/useWorkstationNotesStore";
import { useWorkstationProcessGraphStore } from "@/store/useWorkstationProcessGraphStore";
import { renderWorkstationProcessGraphSvg } from "@/lib/workstation/processGraph/renderProcessGraphSvg";
import type {
  SituationGraphLane,
  SituationGraphNodeColumn,
  SituationGraphNodeStatus,
  SituationGraphNodeType,
  TranslationPairNodeConfig,
} from "@shared/helix-situation-graph";
import type { HelixCalculatorSetupContext } from "@shared/helix-calculator-setup-context";
import type { TheoryBadgeV1 } from "@shared/contracts/theory-badge-graph.v1";
import { buildNhm2TheoryBadgeGraphV1 } from "@shared/theory/nhm2-theory-badges";
import { buildCasimirCavityObjectBindings } from "@shared/theory/casimir-cavity-object-bindings";
import { buildCosmicDistanceObjectBindings } from "@shared/theory/cosmic-distance-object-bindings";
import { buildNhm2DiagnosticObjectBindings } from "@shared/theory/nhm2-diagnostic-object-bindings";
import { buildSolarSpectrumObservationBindings } from "@shared/theory/solar-spectrum-observation-bindings";
import { buildStarSimObjectBindings } from "@shared/theory/starsim-object-bindings";
import { buildTokamakPlasmaObjectBindings } from "@shared/theory/tokamak-plasma-object-bindings";
import { buildGalacticDynamicsObjectBindings } from "@shared/theory/galactic-dynamics-object-bindings";
import { buildCurvatureCollapseObjectBindings } from "@shared/theory/curvature-collapse-object-bindings";
import {
  buildTheoryCalculatorLoadout,
} from "@shared/theory/theory-calculator-loadout";
import { buildTheoryCompoundRun } from "@shared/theory/theory-compound-run-builder";
import {
  buildTheoryFrontierConjectureWorkbenchV1,
  THEORY_FRONTIER_CONJECTURE_WORKBENCH_SCHEMA_VERSION,
  theoryFrontierConjectureForbiddenClaimNotes,
} from "@shared/theory/theory-frontier-conjecture-workbench";
import {
  HELIX_PHYSICS_CALCULATION_INTENTS,
  type HelixPhysicsCalculationIntent,
} from "@shared/contracts/helix-physics-calculation-context-plan.v1";
import { classifyScientificCalculatorExpression } from "@shared/scientific-calculator-workbench";
import {
  HELIX_GOAL_EVALUATION_RECEIPT_SCHEMA,
  HELIX_LIVE_CONTINUATION_TICK_SCHEMA,
  HELIX_LIVE_SOURCE_ADMISSION_RECEIPT_SCHEMA,
  HELIX_WORKER_LANE_RECEIPT_SCHEMA,
  helixHypothesisNotAnswerFlags,
  helixReceiptNotAnswerFlags,
} from "@shared/helix-live-continuation";
import { planHelixPhysicsCalculationContext } from "@shared/theory/helix-physics-calculation-context-planner";
import {
  isTheoryCalculatorLoadoutV1,
  type TheoryCalculatorLoadoutV1,
  type TheoryCalculatorObjectContextV1,
} from "@shared/contracts/theory-calculator-loadout.v1";
import {
  isTheoryCompoundRunV1,
  type TheoryCompoundRunV1,
} from "@shared/contracts/theory-compound-run.v1";
import {
  isTheoryRuntimeMathTraceV1,
  type TheoryRuntimeMathTraceV1,
} from "@shared/contracts/theory-runtime-math-trace.v1";
import {
  locateTheoryBadges,
  traceTheoryBadgeConnections,
} from "@shared/theory/theory-badge-overlap-locator";
import { buildTheoryContextReflection } from "@shared/theory/theory-context-reflector";
import { buildTheoryContextExplanationPlan } from "@shared/theory/theory-context-explanation-plan";
import type {
  TheoryContextReflectionConfidenceMode,
  TheoryContextReflectionSource,
} from "@shared/contracts/theory-context-reflection.v1";
import { isTheoryContextReflectionV1 } from "@shared/contracts/theory-context-reflection.v1";
import {
  PHYSICS_ATLAS_BLOCK_IDS,
  type PhysicsAtlasBlockId,
  type PhysicsAtlasBlockV1,
} from "@shared/contracts/physics-atlas.v1";
import { buildHelixPhysicsAtlasV1, PHYSICS_ATLAS_BLOCKS } from "@shared/theory/physics-atlas-blocks";
import { resolvePhysicsAtlasLens } from "@shared/theory/physics-atlas-lens";
import {
  buildStaticCasimirRuntimeTraceV1,
  buildStaticGrTensorTraceV1,
  buildStaticSolarRuntimeTraceV1,
} from "@shared/theory/runtime-traces";
import {
  buildDottieVoiceReceipt,
  HELIX_AGENT_COMMENTARY_SCHEMA,
  HELIX_DOTTIE_OBSERVER_SUBSCRIPTION_SCHEMA,
  HELIX_DOTTIE_VOICE_RECEIPT_SCHEMA,
  type HelixDottieObserverSubscriptionV1,
} from "@shared/helix-agent-commentary";
import {
  buildDottieManifestPreset,
  buildDottieManifestPresetReceipts,
  type HelixDottieManifestCommentaryCadence,
  type HelixDottieManifestMode,
  type HelixDottieManifestVoiceMode,
} from "@shared/helix-dottie-manifest-preset";
import {
  HELIX_SITUATION_CONSTRUCT_SCHEMA,
  type HelixSituationConstruct,
  type HelixSituationConstructOutputBinding,
  type HelixSituationConstructOutputKind,
  type HelixSituationConstructStatus,
  type HelixSituationConstructType,
} from "@shared/helix-situation-construct";
import {
  HELIX_SITUATION_CONSTRUCT_RECIPE_RUN_SCHEMA,
  HELIX_SITUATION_CONSTRUCT_RECIPE_SCHEMA,
  type HelixSituationConstructRecipe,
  type HelixSituationConstructRecipeId,
  type HelixSituationConstructRecipeRun,
  type HelixSituationConstructRecipeRunStatus,
} from "@shared/helix-situation-construct-recipe";
import {
  SITUATION_ROOM_CONSTRUCT_OBSERVATION_SCHEMA,
  type SituationRoomConstructObservation,
} from "@shared/situation-room-construct-observation";
import {
  SITUATION_ROOM_LIVE_JOB_CONTRACT_SCHEMA,
  type SituationRoomLiveJobContract,
  type SituationRoomVoicePolicy,
} from "@shared/situation-room-live-job-contract";
import { recordDottieVoiceDebugClip } from "@/lib/helix/dottie-voice-debug-clips";
import type {
  NarratorDeliveryMode,
  NarratorSourceKind,
} from "@shared/contracts/narrator-event.v1";

export type HelixPanelActionRequest = {
  panel_id: string;
  action_id: string;
  args?: Record<string, unknown>;
};

export type HelixPanelActionExecutionResult = {
  ok: boolean;
  panel_id: string;
  action_id: string;
  artifact?: Record<string, unknown> | null;
  message?: string;
};

export type HelixPanelActionExecutionContext = {
  openPanel: (panelId: string, groupId?: string) => void;
  focusPanel: (panelId: string, groupId?: string) => void;
  closePanel: (panelId: string, groupId?: string) => void;
  openSettings: (tab?: SettingsTab) => void;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const narratorSourceKinds = new Set<NarratorSourceKind>([
  "final_answer",
  "helix_console",
  "voice_receipt",
  "workstation_panel",
  "live_answer",
  "image_lens",
  "situation_room",
  "microdeck",
  "hover_focus_inspector",
]);

const narratorDeliveryModes = new Set<NarratorDeliveryMode>([
  "hidden",
  "visible_only",
  "confirm_to_speak",
  "auto_speak",
]);

const narratorStreamKinds = new Set([
  "transcript_stream",
  "translated_transcript",
  "translated_speech",
  "typed_commentary",
  "route_evidence",
  "source_health_status",
]);

function asNarratorSourceKind(value: unknown): NarratorSourceKind | null {
  const sourceKind = asNonEmptyString(value);
  return sourceKind && narratorSourceKinds.has(sourceKind as NarratorSourceKind)
    ? sourceKind as NarratorSourceKind
    : null;
}

function asNarratorDeliveryMode(value: unknown): NarratorDeliveryMode | null {
  const mode = asNonEmptyString(value);
  return mode && narratorDeliveryModes.has(mode as NarratorDeliveryMode)
    ? mode as NarratorDeliveryMode
    : null;
}

function asNarratorStreamKind(value: unknown): string | null {
  const streamKind = asNonEmptyString(value);
  return streamKind && narratorStreamKinds.has(streamKind) ? streamKind : null;
}

function asTheoryContextReflectionSource(value: unknown): TheoryContextReflectionSource {
  const source = asNonEmptyString(value);
  if (
    source === "helix_ask" ||
    source === "manual" ||
    source === "scientific_calculator" ||
    source === "workstation_action"
  ) {
    return source;
  }
  return "helix_ask";
}

function asTheoryContextReflectionConfidenceMode(value: unknown): TheoryContextReflectionConfidenceMode {
  const mode = asNonEmptyString(value);
  return mode === "strict_badge_match" ? "strict_badge_match" : "soft_locator";
}

function parensBalanced(value: string): boolean {
  let depth = 0;
  for (const char of value) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function stripCalculatorProseTail(value: string): string {
  return value
    .replace(/\s*,?\s*(?:then|and)\s+(?:explain|describe|interpret|summari[sz]e|tell|show|give|report)\b[\s\S]*$/i, "")
    .replace(/\s+(?:with|using|in)\s+(?:the\s+)?(?:scientific\s+)?calculator\b[\s\S]*$/i, "")
    .replace(/\s+(?:with\s+)?(?:steps?|show\s+work|trace)$/i, "")
    .trim();
}

function normalizeCalculatorMixedNumberLiterals(value: string): string {
  return value.replace(/(^|[^\w./])(\d+)\s+(\d+)\s*\/\s*(\d+)(?=$|[^\w./])/g, (match, prefix, whole, numerator, denominator) => {
    const wholeValue = Number(whole);
    const numeratorValue = Number(numerator);
    const denominatorValue = Number(denominator);
    if (
      !Number.isSafeInteger(wholeValue) ||
      !Number.isSafeInteger(numeratorValue) ||
      !Number.isSafeInteger(denominatorValue) ||
      denominatorValue === 0
    ) {
      return match;
    }
    const improperNumerator = wholeValue * denominatorValue + numeratorValue;
    return `${prefix}(${improperNumerator}/${denominatorValue})`;
  });
}

function normalizeCalculatorArithmeticSpan(value: string): string {
  let candidate = normalizeCalculatorMixedNumberLiterals(value)
    .replace(/\s+/g, "")
    .replace(/[.!?,"'`\]]+$/g, "");
  while (candidate.endsWith(")") && !parensBalanced(candidate)) {
    candidate = candidate.slice(0, -1);
  }
  return candidate;
}

const CALCULATOR_FUNCTION_TOKEN_PATTERN =
  /(?:\\(?:sqrt|ln|log|sin|cos|tan|asin|acos|atan|exp|abs)\b|\b(?:sqrt|ln|log|sin|cos|tan|asin|acos|atan|exp|abs)\s*\(|\b(?:pi|e)\b)/i;
const CALCULATOR_SYMBOLIC_EXPRESSION_PATTERN = /^[A-Za-z0-9_()+\-*/^.,\\{}\[\]]+$/;

function extractLabeledCalculatorExpression(value: string): string | null {
  const match = value.match(/\b(?:exact\s+)?(?:latex|expression|input)\s*:\s*([^\r\n]+)/i);
  return match?.[1]?.trim() || null;
}

function normalizeCalculatorSymbolicSpan(value: string): string {
  let candidate = normalizeCalculatorMixedNumberLiterals(value)
    .replace(/\s+/g, "")
    .replace(/[.!?,"'`\]]+$/g, "");
  while (candidate.endsWith(")") && !parensBalanced(candidate)) {
    candidate = candidate.slice(0, -1);
  }
  return candidate;
}

function normalizeCalculatorFunctionExpression(value: string): string | null {
  const candidate = normalizeCalculatorSymbolicSpan(value);
  if (!candidate || candidate.includes(":")) return null;
  if (!CALCULATOR_FUNCTION_TOKEN_PATTERN.test(candidate)) return null;
  if (!/[0-9]/.test(candidate)) return null;
  if (!/[()+\-*/^\\]/.test(candidate)) return null;
  if (!parensBalanced(candidate)) return null;
  if (!CALCULATOR_SYMBOLIC_EXPRESSION_PATTERN.test(candidate)) return null;
  return candidate;
}

function normalizeCalculatorActionLatex(value: string): string {
  const cleaned = normalizeCalculatorMixedNumberLiterals(stripCalculatorProseTail(value));
  const labeledExpression = extractLabeledCalculatorExpression(cleaned);
  const directiveTail = cleaned.match(/\b(?:solve|evaluate|compute|calculate|check|verify)\s+(.+)$/i)?.[1];
  const candidate = directiveTail ? stripCalculatorProseTail(directiveTail) : (labeledExpression ?? cleaned);
  const functionExpression = normalizeCalculatorFunctionExpression(candidate);
  if (functionExpression) return functionExpression;
  const equation = candidate.match(/(?:[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?\s*\*\s*)?[A-Za-z_][A-Za-z0-9_]*(?:\s*\^\s*[-+]?\d+(?:\.\d+)?)?(?:\s*[+\-*/]\s*[-+()A-Za-z0-9_.*\/^\\\s]+)*\s*=\s*[-+()A-Za-z0-9_.*\/^\\\s]+/i)?.[0];
  if (equation) return equation.trim();
  if (candidate.includes("=")) return candidate;
  const arithmeticMatches = candidate.match(/[()+\-*/^\d.eE\s]+/g) ?? [];
  for (const match of arithmeticMatches) {
    const candidate = normalizeCalculatorArithmeticSpan(match);
    if (!candidate || !/\d/.test(candidate) || !/[+\-*/^]/.test(candidate)) continue;
    if (!parensBalanced(candidate)) continue;
    if (/^[()+\-*/^\d.eE]+$/.test(candidate)) return candidate;
  }
  return candidate;
}

function isCalculatorActionExpression(value: string | null | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/\b(?:einstein\s+tensor|qi\s+guardrail|natario|warp\.?metric|adm|stress[-\s]?energy)\b/i.test(trimmed)) {
    return true;
  }
  if (/\\(?:frac|sqrt|lambda|sum|int)\b/i.test(trimmed)) return true;
  if (/[=+\-*/^]/.test(trimmed) && /[A-Za-z0-9]/.test(trimmed)) return true;
  return false;
}

function resolveCalculatorActionLatex(rawLatex: string | null, calculatorSetup: HelixCalculatorSetupContext | null): string | null {
  const setupExpression = calculatorSetup?.display_latex ?? calculatorSetup?.expression ?? null;
  const normalizedSetup = setupExpression ? normalizeCalculatorActionLatex(setupExpression) : null;
  const normalizedRaw = rawLatex ? normalizeCalculatorActionLatex(rawLatex) : null;
  if (isCalculatorActionExpression(normalizedSetup)) return normalizedSetup;
  if (isCalculatorActionExpression(normalizedRaw)) return normalizedRaw;
  return null;
}

function asCalculatorSetupContext(value: unknown): HelixCalculatorSetupContext | null {
  const record = asRecord(value);
  if (!record) return null;
  const expression = asNonEmptyString(record.expression);
  const displayLatex = asNonEmptyString(record.display_latex) ?? expression;
  const subgoal = asNonEmptyString(record.subgoal);
  if (!expression || !displayLatex || !subgoal) return null;
  return record as HelixCalculatorSetupContext;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "true" || trimmed === "yes" || trimmed === "y" || trimmed === "1") return true;
    if (trimmed === "false" || trimmed === "no" || trimmed === "n" || trimmed === "0") return false;
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => asNonEmptyString(entry))
      .filter((entry): entry is string => Boolean(entry));
  }
  const single = asNonEmptyString(value);
  return single ? [single] : [];
}

const dottieObserverSubscriptions = new Map<string, HelixDottieObserverSubscriptionV1>();
const situationConstructs = new Map<string, HelixSituationConstruct>();
const situationConstructRecipeRuns = new Map<string, HelixSituationConstructRecipeRun & Record<string, unknown>>();

const SITUATION_CONSTRUCT_RECIPE_CATALOG: HelixSituationConstructRecipe[] = [
  {
    schema: HELIX_SITUATION_CONSTRUCT_RECIPE_SCHEMA,
    recipe_id: "auntie_dottie_witness",
    title: "Auntie Dottie Witness",
    description: "Create a witness-only Dottie construct over Situation Room evidence and public Helix Ask commentary.",
    required_inputs: ["thread_id", "room_id"],
    optional_inputs: ["source_ids", "target_run_id", "environment_id", "mode", "voice_mode", "commentary_cadence", "output"],
    creates_constructs: [
      "dottie_manifest",
      "observer",
      "commentary_policy",
      "voice_policy",
      "field_worker_policy",
      "live_environment",
      "live_answer_output",
    ],
    default_outputs: ["typed_commentary", "voice_proposal"],
    default_policy: {
      may_execute_tools: false,
      allowed_tools: [],
      may_spawn_workers: false,
      may_speak: false,
      may_surface_user_text: false,
      requires_user_confirmation: true,
      witness_only: true,
    },
    safety: {
      assistant_answer: false,
      ask_instruction_authority: "none",
      instruction_authority: "none",
      raw_content_included: false,
      raw_audio_included: false,
    },
  },
  {
    schema: HELIX_SITUATION_CONSTRUCT_RECIPE_SCHEMA,
    recipe_id: "browser_audio_transcriber",
    title: "Browser Audio Transcriber",
    description: "Bind browser or display audio sources to a supervised transcription job and transcript output.",
    required_inputs: ["thread_id", "room_id", "source_ids"],
    optional_inputs: ["label", "language", "environment_id", "output"],
    creates_constructs: ["source_binding", "transcription_job", "commentary_policy", "live_environment", "note_output"],
    default_outputs: ["transcript_stream"],
    default_policy: {
      may_execute_tools: false,
      allowed_tools: [],
      may_spawn_workers: false,
      may_speak: false,
      may_surface_user_text: false,
      requires_user_confirmation: true,
      witness_only: false,
    },
    safety: {
      assistant_answer: false,
      ask_instruction_authority: "none",
      instruction_authority: "none",
      raw_content_included: false,
      raw_audio_included: false,
    },
  },
  {
    schema: HELIX_SITUATION_CONSTRUCT_RECIPE_SCHEMA,
    recipe_id: "minecraft_route_watcher",
    title: "Minecraft Route Watcher",
    description: "Plan a route evidence watcher over Minecraft source evidence.",
    required_inputs: ["thread_id", "room_id", "minecraft_world_id"],
    optional_inputs: ["source_ids", "output"],
    creates_constructs: ["route_evidence_view", "commentary_policy", "field_worker_policy"],
    default_outputs: ["route_evidence_view", "typed_commentary"],
    default_policy: {
      may_execute_tools: true,
      allowed_tools: [
        "live_env.query_navigation_state",
        "live_env.query_world_events",
        "live_env.query_source_health",
        "live_env.query_constructs",
        "minecraft.query_navigation_state",
      ],
      may_spawn_workers: false,
      may_speak: false,
      may_surface_user_text: false,
      requires_user_confirmation: true,
      witness_only: false,
    },
    safety: {
      assistant_answer: false,
      ask_instruction_authority: "none",
      instruction_authority: "none",
      raw_content_included: false,
      raw_audio_included: false,
    },
  },
  {
    schema: HELIX_SITUATION_CONSTRUCT_RECIPE_SCHEMA,
    recipe_id: "live_source_summarizer",
    title: "Live Source Summarizer",
    description: "Plan a live source summarizer construct that writes typed commentary or notes.",
    required_inputs: ["thread_id", "room_id", "source_ids"],
    optional_inputs: ["output"],
    creates_constructs: ["commentary_policy", "commentary_output", "note_output"],
    default_outputs: ["typed_commentary"],
    default_policy: {
      may_execute_tools: false,
      allowed_tools: [],
      may_spawn_workers: false,
      may_speak: false,
      may_surface_user_text: false,
      requires_user_confirmation: true,
      witness_only: false,
    },
    safety: {
      assistant_answer: false,
      ask_instruction_authority: "none",
      instruction_authority: "none",
      raw_content_included: false,
      raw_audio_included: false,
    },
  },
  {
    schema: HELIX_SITUATION_CONSTRUCT_RECIPE_SCHEMA,
    recipe_id: "translation_pair",
    title: "Translation Pair",
    description: "Plan a bounded translation construct over two speaker/source bindings.",
    required_inputs: ["thread_id", "room_id", "target_language", "native_language"],
    optional_inputs: ["source_ids", "output"],
    creates_constructs: ["source_binding", "transcription_job", "commentary_output"],
    default_outputs: ["transcript_stream", "note"],
    default_policy: {
      may_execute_tools: false,
      allowed_tools: [],
      may_spawn_workers: false,
      may_speak: false,
      may_surface_user_text: false,
      requires_user_confirmation: true,
      witness_only: false,
    },
    safety: {
      assistant_answer: false,
      ask_instruction_authority: "none",
      instruction_authority: "none",
      raw_content_included: false,
      raw_audio_included: false,
    },
  },
  {
    schema: HELIX_SITUATION_CONSTRUCT_RECIPE_SCHEMA,
    recipe_id: "source_health_watch",
    title: "Source Health Watch",
    description: "Plan a source health construct for stale, missing, or contradictory source evidence.",
    required_inputs: ["thread_id", "room_id", "source_ids"],
    optional_inputs: ["output"],
    creates_constructs: ["source_binding", "commentary_policy", "field_worker_policy"],
    default_outputs: ["typed_commentary"],
    default_policy: {
      may_execute_tools: false,
      allowed_tools: [],
      may_spawn_workers: false,
      may_speak: false,
      may_surface_user_text: false,
      requires_user_confirmation: true,
      witness_only: false,
    },
    safety: {
      assistant_answer: false,
      ask_instruction_authority: "none",
      instruction_authority: "none",
      raw_content_included: false,
      raw_audio_included: false,
    },
  },
];

function boundedDottieMaxChars(value: unknown): number {
  const parsed = asNumber(value);
  if (!parsed) return 220;
  return Math.max(24, Math.min(500, Math.floor(parsed)));
}

function nextDottieObserverId(profile: string, targetRunId: string): string {
  return `observer:${slugify(profile) || "dottie"}:${slugify(targetRunId) || "run"}:${Date.now()}`;
}

function normalizeDottieManifestMode(value: unknown): HelixDottieManifestMode {
  const mode = asNonEmptyString(value);
  if (mode === "observer" || mode === "auntie_dottie" || mode === "operator_witness") return mode;
  return "auntie_dottie";
}

function normalizeDottieManifestVoiceMode(value: unknown): HelixDottieManifestVoiceMode {
  const mode = asNonEmptyString(value);
  if (mode === "off" || mode === "propose_only" || mode === "on_confirm") return mode;
  if (mode === "voice_on_confirm") return "on_confirm";
  if (mode === "text_only") return "off";
  return "propose_only";
}

function normalizeDottieManifestCommentaryCadence(value: unknown): HelixDottieManifestCommentaryCadence {
  const cadence = asNonEmptyString(value);
  if (cadence === "milestones_only" || cadence === "salience_only" || cadence === "manual") return cadence;
  return "milestones_only";
}

function resolveSituationConstructRecipeId(value: unknown): HelixSituationConstructRecipeId | null {
  const recipeId = asNonEmptyString(value);
  return SITUATION_CONSTRUCT_RECIPE_CATALOG.some((recipe) => recipe.recipe_id === recipeId)
    ? (recipeId as HelixSituationConstructRecipeId)
    : null;
}

function resolveSituationConstructOutput(value: unknown): HelixSituationConstructOutputKind | null {
  const output = asNonEmptyString(value);
  if (
    output === "live_answer_environment" ||
    output === "transcript_stream" ||
    output === "typed_commentary" ||
    output === "voice_proposal" ||
    output === "route_evidence_view" ||
    output === "note"
  ) {
    return output;
  }
  return null;
}

function resolveSituationConstructStatus(value: unknown): HelixSituationConstructStatus | null {
  const status = asNonEmptyString(value);
  if (
    status === "planned" ||
    status === "receipt_only" ||
    status === "active" ||
    status === "blocked" ||
    status === "stale" ||
    status === "detached" ||
    status === "completed"
  ) {
    return status;
  }
  return null;
}

function resolveSituationRoomVoicePolicy(value: unknown, fallback: SituationRoomVoicePolicy = "muted"): SituationRoomVoicePolicy {
  const policy = asNonEmptyString(value);
  if (
    policy === "muted" ||
    policy === "propose_only" ||
    policy === "confirm_speak_required" ||
    policy === "automatic_when_policy_allows"
  ) {
    return policy;
  }
  if (policy === "on_confirm" || policy === "voice_on_confirm") return "confirm_speak_required";
  if (policy === "off" || policy === "text_only") return "muted";
  return fallback;
}

function nextSituationConstructId(type: HelixSituationConstructType, name: string): string {
  return `construct:${type}:${slugify(name) || "construct"}:${Date.now()}:${situationConstructs.size + 1}`;
}

function outputBindingsForPanelConstruct(input: {
  outputKinds?: HelixSituationConstructOutputKind[];
  outputBindings?: HelixSituationConstructOutputBinding[];
  environmentId?: string | null;
  status?: HelixSituationConstructStatus;
}): HelixSituationConstructOutputBinding[] {
  if (input.outputBindings) return input.outputBindings;
  return (input.outputKinds ?? []).map((output_kind) => ({
    output_kind,
    artifact_ref: output_kind === "live_answer_environment" ? input.environmentId ?? null : null,
    status:
      output_kind === "live_answer_environment" && input.environmentId
        ? "active"
        : input.status === "active"
          ? "active"
          : "planned",
  }));
}

function createPanelSituationConstruct(input: {
  type: HelixSituationConstructType;
  name: string;
  description?: string | null;
  status?: HelixSituationConstructStatus;
  threadId: string;
  roomId: string;
  environmentId?: string | null;
  sourceIds?: string[];
  parentConstructIds?: string[];
  receiptRefs?: string[];
  evidenceRefs?: string[];
  outputKinds?: HelixSituationConstructOutputKind[];
  outputBindings?: HelixSituationConstructOutputBinding[];
  allowedTools?: string[];
  mayExecuteTools?: boolean;
  maySpeak?: boolean;
  maySurfaceUserText?: boolean;
  witnessOnly?: boolean;
}): HelixSituationConstruct {
  const now = new Date().toISOString();
  const allowedTools = Array.from(new Set(input.allowedTools ?? []))
    .filter((tool) => /^live_env\.query_[a-z0-9_]+$/i.test(tool) || /^minecraft\.query_[a-z0-9_]+$/i.test(tool));
  const executableType =
    input.type === "route_evidence_view" ||
    input.type === "field_worker_policy" ||
    input.type === "field_worker";
  const witnessOnly = input.witnessOnly ?? input.type === "observer";
  const construct: HelixSituationConstruct = {
    schema: HELIX_SITUATION_CONSTRUCT_SCHEMA,
    construct_id: nextSituationConstructId(input.type, input.name),
    type: input.type,
    name: input.name,
    description: input.description ?? null,
    status: input.status ?? "planned",
    thread_id: input.threadId,
    room_id: input.roomId,
    environment_id: input.environmentId ?? null,
    source_ids: Array.from(new Set(input.sourceIds ?? [])),
    parent_construct_ids: Array.from(new Set(input.parentConstructIds ?? [])),
    child_construct_ids: [],
    artifact_refs: [],
    receipt_refs: Array.from(new Set(input.receiptRefs ?? [])),
    commentary_refs: [],
    evidence_refs: Array.from(new Set(input.evidenceRefs ?? [])),
    output_bindings: outputBindingsForPanelConstruct(input),
    policy: {
      may_execute_tools: input.mayExecuteTools === true && executableType && allowedTools.length > 0,
      allowed_tools: input.mayExecuteTools === true && executableType ? allowedTools : [],
      may_spawn_workers: false,
      may_speak:
        input.type !== "observer" &&
        input.type !== "dottie_manifest" &&
        input.type !== "voice_policy" &&
        input.type !== "transcription_job" &&
        input.type !== "source_binding" &&
        input.maySpeak === true,
      may_surface_user_text: input.maySurfaceUserText === true && !witnessOnly && input.type !== "transcription_job",
      requires_user_confirmation: true,
      witness_only: witnessOnly,
    },
    safety: {
      assistant_answer: false,
      raw_content_included: false,
      raw_audio_included: false,
      raw_user_text_included: false,
      instruction_authority: "none",
      ask_instruction_authority: "none",
      ask_context_policy: "evidence_only",
      context_role: "tool_evidence",
    },
    created_at: now,
    updated_at: now,
  };
  situationConstructs.set(construct.construct_id, construct);
  for (const parentId of construct.parent_construct_ids) {
    const parent = situationConstructs.get(parentId);
    if (parent && !parent.child_construct_ids.includes(construct.construct_id)) {
      situationConstructs.set(parentId, {
        ...parent,
        child_construct_ids: [...parent.child_construct_ids, construct.construct_id],
        updated_at: now,
      });
    }
  }
  return construct;
}

function updatePanelSituationConstruct(
  constructId: string,
  mutate: (construct: HelixSituationConstruct) => HelixSituationConstruct,
): HelixSituationConstruct | null {
  const existing = situationConstructs.get(constructId);
  if (!existing) return null;
  const updated = mutate({ ...existing, updated_at: new Date().toISOString() });
  situationConstructs.set(constructId, updated);
  return updated;
}

function buildPanelLiveJobContract(input: {
  recipeId: HelixSituationConstructRecipeId;
  runId: string;
  threadId: string;
  roomId: string;
  sourceIds: string[];
  args: Record<string, unknown>;
  status: HelixSituationConstructRecipeRunStatus;
  missingEvidence: string[];
}): SituationRoomLiveJobContract {
  const now = new Date().toISOString();
  const operatingPrompt =
    asNonEmptyString(input.args.operating_prompt ?? input.args.operatingPrompt ?? input.args.objective) ??
    (input.recipeId === "auntie_dottie_witness"
      ? "Watch the live situation as Auntie Dottie. Only propose short witness callouts from public evidence, and do not speak unless confirmed."
      : input.recipeId === "browser_audio_transcriber"
        ? "Transcribe browser audio into evidence without creating answer authority."
        : "Run this Situation Room construct as evidence-only live work.");
  const voicePolicy = input.recipeId === "auntie_dottie_witness"
    ? resolveSituationRoomVoicePolicy(input.args.voice_policy ?? input.args.voicePolicy ?? input.args.voice_mode ?? input.args.voiceMode, "propose_only")
    : "muted";
  const sourceRequirements: SituationRoomLiveJobContract["source_requirements"] =
    input.recipeId === "browser_audio_transcriber"
      ? [{
          source_kind: "browser_audio",
          required: true,
          status: input.sourceIds.length ? "connected" : "missing",
          binding_id: input.sourceIds[0],
          missing_reason: input.sourceIds.length ? undefined : "Browser or display audio source is required for transcription.",
        }]
      : input.recipeId === "auntie_dottie_witness"
        ? [
            {
              source_kind: "minecraft_world_events",
              required: false,
              status: input.sourceIds.some((source) => /minecraft|world/i.test(source)) ? "connected" : "unknown",
              binding_id: input.sourceIds.find((source) => /minecraft|world/i.test(source)),
              missing_reason: "Minecraft world events are required before route watching can become active.",
            },
            {
              source_kind: "mic_audio",
              required: false,
              status: input.sourceIds.some((source) => /mic|audio/i.test(source)) ? "connected" : "unknown",
              binding_id: input.sourceIds.find((source) => /mic|audio/i.test(source)),
            },
          ]
        : [{
            source_kind: "operator_text",
            required: false,
            status: "unknown",
          }];
  return {
    schema: SITUATION_ROOM_LIVE_JOB_CONTRACT_SCHEMA,
    contract_id: `situation_live_job:${slugify(input.recipeId)}:${Date.now()}`,
    turn_id: asNonEmptyString(input.args.turn_id ?? input.args.turnId) ?? input.runId,
    name: input.recipeId === "auntie_dottie_witness"
      ? "Auntie Dottie Witness"
      : input.recipeId === "browser_audio_transcriber"
        ? "Browser Audio Transcriber"
        : "Situation Room Construct",
    purpose: input.recipeId === "auntie_dottie_witness"
      ? "voice_witness"
      : input.recipeId === "browser_audio_transcriber"
        ? "transcription"
        : "custom",
    selected_recipe: input.recipeId,
    operating_prompt: operatingPrompt,
    operating_prompt_history: [{
      prompt: operatingPrompt,
      changed_at: now,
      changed_by: "user",
      reason: "initial_construct_recipe_prompt",
    }],
    compiled_policy: {
      callout_style: input.recipeId === "auntie_dottie_witness" ? "tactical" : "short",
      interruption_policy: input.recipeId === "auntie_dottie_witness" ? "policy_triggered" : "direct_questions_only",
      evidence_threshold: /confirmed|only\s+if/i.test(operatingPrompt) ? "confirmed" : "observed",
      cadence: "event_driven",
      suppress_until_trigger: true,
      trigger_rules: input.recipeId === "auntie_dottie_witness"
        ? ["public_commentary_available", "direct_question", "policy_triggered_event"]
        : ["source_available", "transcript_chunk_ready"],
      stop_conditions: ["user_stops_job", "source_detached", "operating_prompt_replaced"],
    },
    source_requirements: sourceRequirements,
    output_bindings: input.recipeId === "auntie_dottie_witness"
      ? [
          { output_kind: "typed_commentary", status: "planned", policy: { authority: "evidence_only" } },
          { output_kind: "voice_proposal", status: "planned", policy: { voice_policy: voicePolicy } },
          { output_kind: "live_answers_card", status: "planned", policy: { projection_only: true } },
        ]
      : input.recipeId === "browser_audio_transcriber"
        ? [
            { output_kind: "transcript_stream", status: "planned", policy: { raw_audio_included: false } },
            { output_kind: "typed_commentary", status: "planned", policy: { authority: "evidence_only" } },
            { output_kind: "live_answers_card", status: "planned", policy: { projection_only: true } },
          ]
        : [{ output_kind: "typed_commentary", status: "planned", policy: { authority: "evidence_only" } }],
    voice_policy: voicePolicy,
    authority_policy: {
      assistant_answer: false,
      construct_answer_authority: input.recipeId === "auntie_dottie_witness" ? "witness_only" : "evidence_only",
      helix_ask_terminal_authority_required: true,
    },
    runtime_status: input.status === "active"
      ? "active"
      : input.status === "blocked"
        ? "blocked"
        : "proposed",
    diagnostics: input.missingEvidence.map((missing) => ({
      code: `missing_${missing}`,
      severity: "warning",
      message: `Missing required input: ${missing}.`,
      repair_action: "attach_source",
    })),
    assistant_answer: false,
    raw_content_included: false,
  };
}

function constructObservationRole(
  construct: HelixSituationConstruct,
): SituationRoomConstructObservation["created_constructs"][number]["role"] {
  if (construct.type === "observer" || construct.type === "dottie_manifest" || construct.type === "voice_policy") return "observer";
  if (construct.type === "transcription_job") return "transcriber";
  if (construct.type === "route_evidence_view") return "route_watcher";
  return "source_health_watcher";
}

function constructObservationStatus(
  construct: HelixSituationConstruct,
): SituationRoomConstructObservation["created_constructs"][number]["status"] {
  if (construct.status === "active") return "active";
  if (construct.status === "blocked") return "blocked";
  if (construct.status === "stale") return "stale";
  if (construct.status === "detached" || construct.status === "completed") return "paused";
  return "created";
}

function buildPanelConstructObservation(input: {
  action: SituationRoomConstructObservation["action"];
  runId: string;
  constructs: HelixSituationConstruct[];
  contract?: SituationRoomLiveJobContract | null;
  missingInputs?: string[];
  voicePolicy?: SituationRoomVoicePolicy;
  spoken?: boolean;
  confirmSpeakReceiptPresent?: boolean;
}): SituationRoomConstructObservation {
  const voicePolicy = input.voicePolicy ?? input.contract?.voice_policy ?? "muted";
  const spoken = input.spoken === true;
  return {
    schema: SITUATION_ROOM_CONSTRUCT_OBSERVATION_SCHEMA,
    observation_id: `${input.runId}:construct_observation:${Date.now()}`,
    turn_id: input.contract?.turn_id ?? input.runId,
    action: input.action,
    live_job_contract_ref: input.contract?.contract_id,
    construct_ids: input.constructs.map((construct) => construct.construct_id),
    created_constructs: input.constructs.map((construct) => ({
      construct_id: construct.construct_id,
      name: construct.name,
      role: constructObservationRole(construct),
      authority: construct.policy.witness_only ? "witness_only" : "evidence_only",
      status: constructObservationStatus(construct),
    })),
    missing_inputs: input.missingInputs ?? [],
    policy_state: {
      voice_policy: voicePolicy,
      spoken,
      confirm_speak_receipt_present: input.confirmSpeakReceiptPresent === true,
      output_authority: spoken ? "confirmed_spoken" : voicePolicy === "muted" ? "typed_only" : "proposal",
    },
    output_bindings: Array.from(
      new Set(input.constructs.flatMap((construct) => construct.output_bindings.map((binding) => binding.output_kind))),
    ),
    source_status: input.contract?.source_requirements.map((source) => ({
      source_kind: source.source_kind,
      status: source.status,
      message: source.missing_reason ?? `${source.source_kind} is ${source.status}.`,
    })) ?? [],
    diagnostics: input.contract?.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      message: diagnostic.message,
      severity: diagnostic.severity,
    })) ?? [],
    terminal_eligible: false,
    panel_generated_answer: false,
    next_step_authority: "agent_step_decision",
    assistant_answer: false,
    raw_content_included: false,
  };
}

function buildConstructRecipeRunArtifact(args: Record<string, unknown>): {
  recipeRun: HelixSituationConstructRecipeRun & Record<string, unknown>;
  constructs: HelixSituationConstruct[];
  compatibilityReceipt?: Record<string, unknown>;
} | null {
  const recipeId = resolveSituationConstructRecipeId(args.recipe_id ?? args.recipeId);
  if (!recipeId) return null;
  const room = resolveSituationRoom(args);
  const threadId = asNonEmptyString(args.thread_id ?? args.threadId) ?? "helix-ask:desktop";
  const roomId = asNonEmptyString(args.room_id ?? args.roomId) ?? room?.room_id ?? "situation-room:active";
  const sourceIds = Array.from(
    new Set([
      ...asStringArray(args.source_ids ?? args.sourceIds),
      ...asStringArray(args.source_id ?? args.sourceId),
      ...(room ? resolveSituationSourceIds(room, args) : []),
    ].filter(Boolean)),
  );
  const output = resolveSituationConstructOutput(args.output);
  const environmentId = asNonEmptyString(args.environment_id ?? args.environmentId);
  const createdConstructs: HelixSituationConstruct[] = [];
  const receiptRefs: string[] = [];
  const missingEvidence: string[] = [];
  let status: HelixSituationConstructRecipeRunStatus = "planned";
  let compatibilityReceipt: Record<string, unknown> | undefined;

  if (recipeId === "auntie_dottie_witness") {
    const preset = buildDottieManifestPreset({
      threadId,
      roomId,
      sourceIds,
      mode: normalizeDottieManifestMode(args.mode),
      voiceMode: normalizeDottieManifestVoiceMode(args.voice_mode ?? args.voiceMode),
      commentaryCadence: normalizeDottieManifestCommentaryCadence(
        args.commentary_cadence ?? args.commentaryCadence ?? args.cadence,
      ),
      targetRunId: asNonEmptyString(args.target_run_id ?? args.targetRunId),
      objective: asNonEmptyString(args.objective),
      maxChars: asNumber(args.max_chars ?? args.maxChars),
      environmentId,
    });
    const receipt = buildDottieManifestPresetReceipts(preset);
    compatibilityReceipt = receipt as unknown as Record<string, unknown>;
    receiptRefs.push(...receipt.child_artifact_refs);
    const manifest = createPanelSituationConstruct({
      type: "dottie_manifest",
      name: "Auntie Dottie Manifest",
      description: "Witness-only Dottie construct recipe receipt.",
      status: "receipt_only",
      threadId,
      roomId,
      sourceIds,
      receiptRefs,
      outputKinds: ["typed_commentary"],
    });
    createdConstructs.push(
      manifest,
      createPanelSituationConstruct({
        type: "observer",
        name: "Auntie Dottie Observer",
        description: "Observer subscription over public Helix Ask commentary.",
        status: "receipt_only",
        threadId,
        roomId,
        environmentId,
        sourceIds,
        parentConstructIds: [manifest.construct_id],
        receiptRefs,
        outputKinds: ["typed_commentary"],
      }),
      createPanelSituationConstruct({
        type: "commentary_policy",
        name: "Dottie Commentary Policy",
        status: "receipt_only",
        threadId,
        roomId,
        sourceIds,
        parentConstructIds: [manifest.construct_id],
        receiptRefs,
        outputKinds: ["typed_commentary"],
      }),
      createPanelSituationConstruct({
        type: "voice_policy",
        name: "Dottie Voice Policy",
        status: "receipt_only",
        threadId,
        roomId,
        sourceIds,
        parentConstructIds: [manifest.construct_id],
        receiptRefs,
        outputKinds: ["voice_proposal"],
      }),
      createPanelSituationConstruct({
        type: "field_worker_policy",
        name: "Dottie Field Worker Policy",
        status: "receipt_only",
        threadId,
        roomId,
        sourceIds,
        parentConstructIds: [manifest.construct_id],
        receiptRefs,
      }),
    );
    if (output === "live_answer_environment") {
      const live = createPanelSituationConstruct({
        type: "live_environment",
        name: "Dottie Live Environment",
        status: environmentId ? "active" : "receipt_only",
        threadId,
        roomId,
        environmentId,
        sourceIds,
        parentConstructIds: [manifest.construct_id],
        receiptRefs,
        outputKinds: ["live_answer_environment"],
      });
      createdConstructs.push(
        live,
        createPanelSituationConstruct({
          type: "live_answer_output",
          name: "Dottie Live Answer Output",
          status: environmentId ? "active" : "receipt_only",
          threadId,
          roomId,
          environmentId,
          sourceIds,
          parentConstructIds: [live.construct_id],
          receiptRefs,
          outputKinds: ["live_answer_environment"],
        }),
      );
    }
    status = "applied_as_receipts";
  } else if (recipeId === "browser_audio_transcriber") {
    if (sourceIds.length === 0) missingEvidence.push("source_ids");
    status = missingEvidence.length ? "blocked" : "active";
    createdConstructs.push(
      createPanelSituationConstruct({
        type: "source_binding",
        name: asNonEmptyString(args.label) ?? "Browser Tab Audio Source",
        description: "Source binding for browser/display audio. Raw audio is not Ask context.",
        status: missingEvidence.length ? "blocked" : "active",
        threadId,
        roomId,
        sourceIds,
        outputKinds: ["transcript_stream"],
      }),
      createPanelSituationConstruct({
        type: "transcription_job",
        name: "Transcript Job",
        description: "Supervised transcription job. Transcript chunks are evidence, not answers.",
        status: missingEvidence.length ? "blocked" : "active",
        threadId,
        roomId,
        environmentId: output === "live_answer_environment" ? environmentId : null,
        sourceIds,
        outputKinds: output === "live_answer_environment" ? ["transcript_stream", "live_answer_environment"] : [output ?? "transcript_stream"],
      }),
      createPanelSituationConstruct({
        type: "commentary_policy",
        name: "Transcription Commentary Policy",
        status: "receipt_only",
        threadId,
        roomId,
        sourceIds,
        outputKinds: ["typed_commentary"],
      }),
    );
    if (output === "live_answer_environment") {
      createdConstructs.push(
        createPanelSituationConstruct({
          type: "live_environment",
          name: "Live Summary Card",
          status: missingEvidence.length ? "blocked" : environmentId ? "active" : "planned",
          threadId,
          roomId,
          environmentId,
          sourceIds,
          outputKinds: ["live_answer_environment"],
        }),
      );
    }
    if (output === "note") {
      createdConstructs.push(
        createPanelSituationConstruct({
          type: "note_output",
          name: "Transcript Note Output",
          status: missingEvidence.length ? "blocked" : "planned",
          threadId,
          roomId,
          sourceIds,
          outputKinds: ["note"],
        }),
      );
    }
  } else {
    const recipe = SITUATION_CONSTRUCT_RECIPE_CATALOG.find((candidate) => candidate.recipe_id === recipeId);
    for (const type of recipe?.creates_constructs ?? []) {
      createdConstructs.push(
        createPanelSituationConstruct({
          type,
          name: `${recipe?.title ?? recipeId} ${type.replace(/_/g, " ")}`,
          status: "planned",
          threadId,
          roomId,
          environmentId: output === "live_answer_environment" ? environmentId : null,
          sourceIds,
          outputKinds: output ? [output] : recipe?.default_outputs,
          mayExecuteTools: recipe?.default_policy.may_execute_tools ?? false,
          allowedTools: recipe?.default_policy.allowed_tools ?? [],
          maySurfaceUserText: recipe?.default_policy.may_surface_user_text ?? false,
          witnessOnly: recipe?.default_policy.witness_only ?? false,
        }),
      );
    }
  }

  const now = new Date().toISOString();
  const runId = `construct_recipe_run:${slugify(recipeId)}:${Date.now()}`;
  const liveJobContract = buildPanelLiveJobContract({
    recipeId,
    runId,
    threadId,
    roomId,
    sourceIds,
    args,
    status,
    missingEvidence,
  });
  const constructObservation = buildPanelConstructObservation({
    action: "construct.create_from_recipe",
    runId,
    constructs: createdConstructs,
    contract: liveJobContract,
    missingInputs: missingEvidence,
    voicePolicy: liveJobContract.voice_policy,
  });
  const recipeRun: HelixSituationConstructRecipeRun & Record<string, unknown> = {
    schema: HELIX_SITUATION_CONSTRUCT_RECIPE_RUN_SCHEMA,
    kind: "situation_construct_recipe_run",
    run_id: runId,
    recipe_id: recipeId,
    thread_id: threadId,
    room_id: roomId,
    status,
    created_construct_ids: createdConstructs.map((construct) => construct.construct_id),
    receipt_refs: Array.from(new Set(receiptRefs)),
    commentary_refs: [],
    missing_evidence: missingEvidence,
    live_job_contract: liveJobContract,
    construct_observation: constructObservation,
    constructs: createdConstructs,
    compatibility_receipt: compatibilityReceipt,
    terminal_eligible: false,
    panel_generated_answer: false,
    next_step_authority: "agent_step_decision",
    assistant_answer: false,
    raw_content_included: false,
    instruction_authority: "none",
    context_role: "tool_evidence",
    ask_context_policy: "evidence_only",
    created_at: now,
  };
  situationConstructRecipeRuns.set(recipeRun.run_id, recipeRun);
  return { recipeRun, constructs: createdConstructs, compatibilityReceipt };
}

function asTheoryCalculatorObjectContext(value: unknown): TheoryCalculatorObjectContextV1 | null {
  const record = asRecord(value);
  if (!record) return null;
  const kind = asNonEmptyString(record.kind);
  if (kind === "starsim_star") {
    const observables = asRecord(record.observables) ?? record;
    return buildStarSimObjectBindings({
      objectId: asNonEmptyString(record.objectId ?? record.object_id ?? observables.objectId ?? observables.object_id),
      label: asNonEmptyString(record.label),
      spectralType: asNonEmptyString(observables.spectralType ?? observables.spectral_type),
      objectClass: asNonEmptyString(observables.objectClass ?? observables.object_class),
      luminosity_Lsun: asNumber(observables.luminosity_Lsun ?? observables.luminosity),
      radius_Rsun: asNumber(observables.radius_Rsun ?? observables.radius),
      mass_Msun: asNumber(observables.mass_Msun ?? observables.mass),
      effectiveTemperature_K: asNumber(observables.effectiveTemperature_K ?? observables.effective_temperature_K),
      parallax_mas: asNumber(observables.parallax_mas),
      properMotionRa_masyr: asNumber(observables.properMotionRa_masyr ?? observables.proper_motion_ra_masyr),
      properMotionDec_masyr: asNumber(observables.properMotionDec_masyr ?? observables.proper_motion_dec_masyr),
      radialVelocity_kms: asNumber(observables.radialVelocity_kms ?? observables.radial_velocity_kms),
      r90_Rstar: asNumber(observables.r90_Rstar ?? observables.r90_rstar),
      distance_pc: asNumber(observables.distance_pc),
      gravitationalConstantNormalized: asNumber(observables.gravitationalConstantNormalized ?? observables.gravitational_constant_normalized),
      channelTemperature_K: asNumber(observables.channelTemperature_K ?? observables.channel_temperature_K),
      channelDensity_g_cm3: asNumber(observables.channelDensity_g_cm3 ?? observables.channel_density_g_cm3),
      magneticField_T: asNumber(observables.magneticField_T ?? observables.magnetic_field_T),
      spectralLineNm: asNumber(observables.spectralLineNm ?? observables.spectral_line_nm),
      source: "helix_ask",
    });
  }
  if (kind === "cosmic_distance_object") {
      const observables = asRecord(record.observables) ?? record;
      return buildCosmicDistanceObjectBindings({
      objectId: asNonEmptyString(record.objectId ?? record.object_id ?? observables.objectId ?? observables.object_id) ?? undefined,
      label: asNonEmptyString(record.label ?? observables.label) ?? undefined,
      lambda_rest: asNumber(observables.lambda_rest ?? observables.lambdaRest) ?? undefined,
      lambda_obs: asNumber(observables.lambda_obs ?? observables.lambdaObs) ?? undefined,
      parallax_mas: asNumber(observables.parallax_mas ?? observables.parallaxMas) ?? undefined,
      P_days: asNumber(observables.P_days ?? observables.period_days ?? observables.periodDays) ?? undefined,
      alpha: asNumber(observables.alpha) ?? undefined,
      beta: asNumber(observables.beta) ?? undefined,
      m_app: asNumber(observables.m_app ?? observables.apparent_magnitude ?? observables.apparentMagnitude) ?? undefined,
      M_abs: asNumber(observables.M_abs ?? observables.absolute_magnitude ?? observables.absoluteMagnitude) ?? undefined,
      z: asNumber(observables.z ?? observables.redshift) ?? undefined,
      H0_km_s_Mpc: asNumber(observables.H0_km_s_Mpc ?? observables.h0_km_s_mpc ?? observables.H0) ?? undefined,
      c_km_s: asNumber(observables.c_km_s ?? observables.c) ?? undefined,
      source: "helix_ask",
    });
  }
  if (kind === "solar_spectrum_observation") {
    const observables = asRecord(record.observables) ?? record;
    return buildSolarSpectrumObservationBindings({
      objectId: asNonEmptyString(record.objectId ?? record.object_id ?? observables.objectId ?? observables.object_id) ?? undefined,
      label: asNonEmptyString(record.label ?? observables.label) ?? undefined,
      lambda: asNumber(observables.lambda ?? observables.wavelength_m) ?? undefined,
      lambda0: asNumber(observables.lambda0 ?? observables.lambda_0 ?? observables.rest_wavelength_m) ?? undefined,
      lambda_obs: asNumber(observables.lambda_obs ?? observables.lambdaObs ?? observables.observed_wavelength_m) ?? undefined,
      T: asNumber(observables.T ?? observables.temperature_K) ?? undefined,
      R: asNumber(observables.R ?? observables.radius_m) ?? undefined,
      sigma: asNumber(observables.sigma) ?? undefined,
      b: asNumber(observables.b ?? observables.wien_b) ?? undefined,
      B: asNumber(observables.B ?? observables.magneticField_T ?? observables.magnetic_field_T) ?? undefined,
      g_eff: asNumber(observables.g_eff ?? observables.gEff) ?? undefined,
      h: asNumber(observables.h ?? observables.planck_h) ?? undefined,
      c: asNumber(observables.c ?? observables.speed_of_light) ?? undefined,
      mu_B: asNumber(observables.mu_B ?? observables.muB ?? observables.bohr_magneton) ?? undefined,
      delta_nu: asNumber(observables.delta_nu ?? observables.deltaNu) ?? undefined,
      P_rad: asNumber(observables.P_rad ?? observables.radiant_power_W ?? observables.radiantPower_W) ?? undefined,
      delta_t: asNumber(observables.delta_t ?? observables.duration_s ?? observables.duration) ?? undefined,
      source: "helix_ask",
    });
  }
  if (kind === "casimir_cavity_object") {
    const observables = asRecord(record.observables) ?? record;
    return buildCasimirCavityObjectBindings({
      objectId: asNonEmptyString(record.objectId ?? record.object_id ?? observables.objectId ?? observables.object_id) ?? undefined,
      label: asNonEmptyString(record.label ?? observables.label) ?? undefined,
      a: asNumber(observables.a ?? observables.gap_m ?? observables.gapMeters) ?? undefined,
      A_tile: asNumber(observables.A_tile ?? observables.tile_area_m2 ?? observables.tileArea_m2) ?? undefined,
      hbar_c: asNumber(observables.hbar_c ?? observables.hbarC) ?? undefined,
      c: asNumber(observables.c ?? observables.speed_of_light) ?? undefined,
      pi: asNumber(observables.pi) ?? undefined,
      E_area: asNumber(observables.E_area ?? observables.energy_per_area_J_m2) ?? undefined,
      E_tile: asNumber(observables.E_tile ?? observables.tile_energy_J) ?? undefined,
      absE_tile: asNumber(observables.absE_tile ?? observables.abs_tile_energy_J) ?? undefined,
      N_tiles: asNumber(observables.N_tiles ?? observables.tile_count) ?? undefined,
      U_static: asNumber(observables.U_static ?? observables.static_energy_J) ?? undefined,
      absU_static: asNumber(observables.absU_static ?? observables.abs_static_energy_J) ?? undefined,
      gammaGeo: asNumber(observables.gammaGeo ?? observables.gamma_geo) ?? undefined,
      Q_L: asNumber(observables.Q_L ?? observables.q_l ?? observables.quality_factor) ?? undefined,
      gamma_VdB: asNumber(observables.gamma_VdB ?? observables.gamma_vdb) ?? undefined,
      d_eff: asNumber(observables.d_eff ?? observables.duty_eff) ?? undefined,
      E_out: asNumber(observables.E_out ?? observables.output_energy_J) ?? undefined,
      L: asNumber(observables.L ?? observables.length_m) ?? undefined,
      n: asNumber(observables.n ?? observables.mode_n) ?? undefined,
      h: asNumber(observables.h ?? observables.planck_h) ?? undefined,
      f_n: asNumber(observables.f_n ?? observables.mode_frequency_Hz) ?? undefined,
      source: "helix_ask",
    });
  }
  if (kind === "nhm2_diagnostic_object") {
    const observables = asRecord(record.observables) ?? record;
    return buildNhm2DiagnosticObjectBindings({
      objectId: asNonEmptyString(record.objectId ?? record.object_id ?? observables.objectId ?? observables.object_id) ?? undefined,
      label: asNonEmptyString(record.label ?? observables.label) ?? undefined,
      t_shift: asNumber(observables.t_shift ?? observables.tShift) ?? undefined,
      delta_t_lapse: asNumber(observables.delta_t_lapse ?? observables.deltaTLapse) ?? undefined,
      E: asNumber(observables.E ?? observables.energy_J) ?? undefined,
      V: asNumber(observables.V ?? observables.volume_m3) ?? undefined,
      rho: asNumber(observables.rho ?? observables.energy_density_J_m3) ?? undefined,
      E_cycle: asNumber(observables.E_cycle ?? observables.cycle_energy_J) ?? undefined,
      T_cycle: asNumber(observables.T_cycle ?? observables.cycle_period_s) ?? undefined,
      P_avg: asNumber(observables.P_avg ?? observables.average_power_W) ?? undefined,
      source_required: asNumber(observables.source_required ?? observables.sourceRequired) ?? undefined,
      source_available: asNumber(observables.source_available ?? observables.sourceAvailable) ?? undefined,
      R_source: asNumber(observables.R_source ?? observables.source_residual) ?? undefined,
      qei_bound: asNumber(observables.qei_bound ?? observables.qeiBound) ?? undefined,
      qei_sample: asNumber(observables.qei_sample ?? observables.qeiSample) ?? undefined,
      qei_margin: asNumber(observables.qei_margin ?? observables.qeiMargin) ?? undefined,
      source: "helix_ask",
    });
  }
  if (kind === "tokamak_plasma_object") {
    const observables = asRecord(record.observables) ?? record;
    return buildTokamakPlasmaObjectBindings({
      objectId: asNonEmptyString(record.objectId ?? record.object_id ?? observables.objectId ?? observables.object_id) ?? undefined,
      label: asNonEmptyString(record.label ?? observables.label) ?? undefined,
      B_T: asNumber(observables.B_T ?? observables.b_T ?? observables.magnetic_field_T) ?? undefined,
      mu0: asNumber(observables.mu0) ?? undefined,
      p_B: asNumber(observables.p_B ?? observables.magnetic_pressure_Pa) ?? undefined,
      p_Pa: asNumber(observables.p_Pa ?? observables.pressure_Pa ?? observables.plasma_pressure_Pa) ?? undefined,
      n_m3: asNumber(observables.n_m3 ?? observables.density_m3) ?? undefined,
      T_eV: asNumber(observables.T_eV ?? observables.temperature_eV) ?? undefined,
      e_charge: asNumber(observables.e_charge) ?? undefined,
      P_in: asNumber(observables.P_in ?? observables.input_power_W) ?? undefined,
      P_loss: asNumber(observables.P_loss ?? observables.loss_power_W) ?? undefined,
      P_net: asNumber(observables.P_net ?? observables.net_power_W) ?? undefined,
      tau_E: asNumber(observables.tau_E ?? observables.energy_confinement_s) ?? undefined,
      W_th: asNumber(observables.W_th ?? observables.thermal_energy_J) ?? undefined,
      score: asNumber(observables.score ?? observables.precursor_score) ?? undefined,
      threshold: asNumber(observables.threshold) ?? undefined,
      precursor_margin: asNumber(observables.precursor_margin) ?? undefined,
      core_count: asNumber(observables.core_count) ?? undefined,
      edge_count: asNumber(observables.edge_count) ?? undefined,
      sol_count: asNumber(observables.sol_count) ?? undefined,
      total_count: asNumber(observables.total_count) ?? undefined,
      source: "helix_ask",
    });
  }
  if (kind === "galactic_dynamics_object") {
    const observables = asRecord(record.observables) ?? record;
    return buildGalacticDynamicsObjectBindings({
      objectId: asNonEmptyString(record.objectId ?? record.object_id ?? observables.objectId ?? observables.object_id) ?? undefined,
      label: asNonEmptyString(record.label ?? observables.label) ?? undefined,
      dx_pc: asNumber(observables.dx_pc ?? observables.dx) ?? undefined,
      dy_pc: asNumber(observables.dy_pc ?? observables.dy) ?? undefined,
      dz_pc: asNumber(observables.dz_pc ?? observables.dz) ?? undefined,
      dvx_kms: asNumber(observables.dvx_kms ?? observables.dvx) ?? undefined,
      dvy_kms: asNumber(observables.dvy_kms ?? observables.dvy) ?? undefined,
      dvz_kms: asNumber(observables.dvz_kms ?? observables.dvz) ?? undefined,
      distance_pc: asNumber(observables.distance_pc) ?? undefined,
      relativeVelocity_kms:
        asNumber(observables.relativeVelocity_kms ?? observables.relative_velocity_kms) ?? undefined,
      structureWeight: asNumber(observables.structureWeight ?? observables.structure_weight) ?? undefined,
      G: asNumber(observables.G) ?? undefined,
      M_enc: asNumber(observables.M_enc ?? observables.enclosed_mass_Msun) ?? undefined,
      r_kpc: asNumber(observables.r_kpc ?? observables.radius_kpc) ?? undefined,
      v_rot: asNumber(observables.v_rot ?? observables.rotation_velocity_kms) ?? undefined,
      v_obs: asNumber(observables.v_obs ?? observables.observedVelocity_km_s ?? observables.observed_velocity_kms) ?? undefined,
      v_model: asNumber(observables.v_model ?? observables.modelVelocity_km_s ?? observables.model_velocity_kms) ?? undefined,
      velocity_residual: asNumber(observables.velocity_residual) ?? undefined,
      residual_sum_sq: asNumber(observables.residual_sum_sq) ?? undefined,
      N_points: asNumber(observables.N_points ?? observables.n_points) ?? undefined,
      source: "helix_ask",
    });
  }
  if (kind === "curvature_collapse_object") {
    const observables = asRecord(record.observables) ?? record;
    return buildCurvatureCollapseObjectBindings({
      objectId: asNonEmptyString(record.objectId ?? record.object_id ?? observables.objectId ?? observables.object_id) ?? undefined,
      label: asNonEmptyString(record.label ?? observables.label) ?? undefined,
      rho_kg_m3: asNumber(observables.rho_kg_m3 ?? observables.rho) ?? undefined,
      power_W: asNumber(observables.power_W ?? observables.power) ?? undefined,
      area_m2: asNumber(observables.area_m2 ?? observables.area) ?? undefined,
      powerFlux_W_m2:
        asNumber(observables.powerFlux_W_m2 ?? observables.power_flux_W_m2 ?? observables.power_flux) ?? undefined,
      d_eff: asNumber(observables.d_eff ?? observables.duty_eff) ?? undefined,
      gain: asNumber(observables.gain) ?? undefined,
      kappa_body: asNumber(observables.kappa_body ?? observables.kappa_body_m2) ?? undefined,
      kappa_drive: asNumber(observables.kappa_drive ?? observables.kappa_drive_m2) ?? undefined,
      tau_ms: asNumber(observables.tau_ms) ?? undefined,
      dt_ms: asNumber(observables.dt_ms) ?? undefined,
      r_c_m: asNumber(observables.r_c_m ?? observables.rc_m) ?? undefined,
      c: asNumber(observables.c ?? observables.speed_of_light) ?? undefined,
      L_present: asNumber(observables.L_present ?? observables.L_present_m) ?? undefined,
      observed: asNumber(observables.observed) ?? undefined,
      bound: asNumber(observables.bound) ?? undefined,
      sigma: asNumber(observables.sigma) ?? undefined,
      G: asNumber(observables.G) ?? undefined,
      source: "helix_ask",
    });
  }
  if (kind === "manual_symbol_bindings" || kind === "generic_physics_object") {
    const variableBindings = asRecord(record.variableBindings ?? record.variable_bindings) ?? {};
    const normalizedBindings = Object.fromEntries(
      Object.entries(variableBindings)
        .map(([key, rawValue]) => [key, typeof rawValue === "number" || typeof rawValue === "string" ? rawValue : null])
        .filter((entry): entry is [string, string | number] => entry[1] !== null),
    );
      return {
        kind,
        objectId: asNonEmptyString(record.objectId ?? record.object_id),
        label: asNonEmptyString(record.label),
        observables: {},
        variableBindings: normalizedBindings,
        units: (asRecord(record.units) as Record<string, string> | null) ?? {},
        source: "helix_ask",
        assumptions: asStringArray(record.assumptions),
        claimBoundaryNotes: asStringArray(record.claim_boundary_notes ?? record.claimBoundaryNotes),
    };
  }
  return null;
}

function asVariableBindings(value: unknown): Record<string, string | number> {
  const record = asRecord(value);
  if (!record) return {};
  return Object.fromEntries(
    Object.entries(record)
      .map(([key, rawValue]) => [key, typeof rawValue === "number" || typeof rawValue === "string" ? rawValue : null])
      .filter((entry): entry is [string, string | number] => entry[1] !== null),
  );
}

function asPhysicsAtlasBlockId(value: unknown): PhysicsAtlasBlockId | null {
  const text = asNonEmptyString(value);
  if (!text) return null;
  return PHYSICS_ATLAS_BLOCK_IDS.includes(text as PhysicsAtlasBlockId) ? (text as PhysicsAtlasBlockId) : null;
}

function asPhysicsAtlasBlockIds(...values: unknown[]): PhysicsAtlasBlockId[] {
  return Array.from(
    new Set(
      values.flatMap((value) =>
        asStringArray(value)
          .map(asPhysicsAtlasBlockId)
          .filter((blockId): blockId is PhysicsAtlasBlockId => Boolean(blockId)),
      ),
    ),
  );
}

function asPhysicsCalculationIntent(value: unknown): HelixPhysicsCalculationIntent {
  const text = asNonEmptyString(value);
  if (text && HELIX_PHYSICS_CALCULATION_INTENTS.includes(text as HelixPhysicsCalculationIntent)) {
    return text as HelixPhysicsCalculationIntent;
  }
  return "locate_only";
}

function buildTheoryLoadoutFromActionArgs(args: Record<string, unknown>, graph: ReturnType<typeof buildNhm2TheoryBadgeGraphV1>): TheoryCalculatorLoadoutV1 {
  const existingLoadout = asRecord(args.loadout);
  if (existingLoadout && isTheoryCalculatorLoadoutV1(existingLoadout)) return existingLoadout;
  const targetBadgeId = asNonEmptyString(args.target_badge_id ?? args.targetBadgeId ?? args.badge_id ?? args.badgeId);
  const badgeIds = asStringArray(args.badge_ids ?? args.badgeIds ?? args.ids);
  const atlasBlockId = asPhysicsAtlasBlockId(args.atlas_block_id ?? args.atlasBlockId ?? args.block_id ?? args.blockId);
  const atlasBlock = atlasBlockId
    ? PHYSICS_ATLAS_BLOCKS.find((block: PhysicsAtlasBlockV1) => block.id === atlasBlockId)
    : null;
  const atlasBadgeIds = atlasBlock
    ? [...atlasBlock.primaryBadgeIds, ...atlasBlock.claimBoundaryBadgeIds].filter((badgeId: string) =>
        graph.badges.some((badge: TheoryBadgeV1) => badge.id === badgeId),
      )
    : [];
  const selectedBadgeIds = badgeIds.length > 0 ? badgeIds : targetBadgeId ? [targetBadgeId] : atlasBadgeIds;
  const requestedMode = asNonEmptyString(args.mode);
  const mode =
    requestedMode === "dependency_path"
      ? "dependency_path"
      : requestedMode === "locator_matches"
        ? "locator_matches"
        : "selected_badges";
  const objectContext = asTheoryCalculatorObjectContext(args.object_context ?? args.objectContext);
  return buildTheoryCalculatorLoadout({
    graph,
    badgeIds: mode === "locator_matches" ? (badgeIds.length > 0 ? badgeIds : targetBadgeId ? [targetBadgeId] : []) : selectedBadgeIds,
    mode,
    source: "workstation_action",
    objectContext,
    variableBindings: asVariableBindings(args.variable_bindings ?? args.variableBindings),
    query: asNonEmptyString(args.query ?? args.text ?? args.prompt) ?? undefined,
    atlasBlockId: atlasBlockId ?? undefined,
    includeContextItems: asBoolean(args.include_context_items ?? args.includeContextItems) ?? true,
  });
}

function asTheoryCompoundRunSolveScope(value: unknown): TheoryCompoundRunSolveScope {
  const text = asNonEmptyString(value);
  if (
    text === "scalar_only" ||
    text === "runtime_trace_only" ||
    text === "scalar_and_runtime" ||
    text === "all_available"
  ) {
    return text;
  }
  if (text === "all_scalar") return "scalar_only";
  if (text === "all_scalar_and_runtime") return "scalar_and_runtime";
  return "all_available";
}

function compoundRunBadgeIdsFromActionArgs(
  args: Record<string, unknown>,
  graph: ReturnType<typeof buildNhm2TheoryBadgeGraphV1>,
): string[] {
  const targetBadgeId = asNonEmptyString(args.target_badge_id ?? args.targetBadgeId ?? args.badge_id ?? args.badgeId);
  const badgeIds = asStringArray(args.badge_ids ?? args.badgeIds ?? args.ids);
  if (badgeIds.length > 0) return badgeIds;
  if (targetBadgeId) return [targetBadgeId];

  const atlasBlockId = asPhysicsAtlasBlockId(args.atlas_block_id ?? args.atlasBlockId ?? args.block_id ?? args.blockId);
  const atlasBlock = atlasBlockId
    ? PHYSICS_ATLAS_BLOCKS.find((block: PhysicsAtlasBlockV1) => block.id === atlasBlockId)
    : null;
  if (!atlasBlock) return [];
  return atlasBlock.primaryBadgeIds.filter((badgeId: string) =>
    graph.badges.some((badge: TheoryBadgeV1) => badge.id === badgeId),
  );
}

function buildTheoryCompoundRunFromActionArgs(
  args: Record<string, unknown>,
  graph: ReturnType<typeof buildNhm2TheoryBadgeGraphV1>,
): TheoryCompoundRunV1 | null {
  const existingRun =
    asRecord(args.run) ??
    asRecord(args.compound_run) ??
    asRecord(args.compoundRun) ??
    asRecord(args.artifact_v1) ??
    asRecord(args.artifactV1);
  if (existingRun && isTheoryCompoundRunV1(existingRun)) return existingRun;

  const runId = asNonEmptyString(args.run_id ?? args.runId);
  const activeRun = useTheoryCompoundRunStore.getState().activeTheoryRun;
  if (runId && activeRun?.runId === runId) return activeRun;

  const badgeIds = compoundRunBadgeIdsFromActionArgs(args, graph);
  if (badgeIds.length === 0) return null;
  const requestedMode = asNonEmptyString(args.mode);
  const mode =
    requestedMode === "dependency_path"
      ? "dependency_path"
      : requestedMode === "locator_matches"
        ? "locator_matches"
        : "selected_badges";
  return buildTheoryCompoundRun({
    graph,
    badgeIds,
    mode,
    source: "workstation_action",
    includeScalar: asBoolean(args.include_scalar ?? args.includeScalar) ?? true,
    includeRuntime: asBoolean(args.include_runtime ?? args.includeRuntime) ?? true,
    includeEvidence: asBoolean(args.include_evidence ?? args.includeEvidence) ?? true,
    includeBoundaries: asBoolean(args.include_boundaries ?? args.includeBoundaries) ?? true,
  });
}

function badgeLooksLikeCasimir(badge: TheoryBadgeV1 | null): boolean {
  return Boolean(badge?.id.startsWith("casimir.") || badge?.subjects.includes("casimir"));
}

function badgeLooksLikeSolar(badge: TheoryBadgeV1 | null): boolean {
  return Boolean(badge?.id.startsWith("solar.") || badge?.subjects.includes("solar"));
}

function buildRuntimeMathTraceFromActionArgs(
  args: Record<string, unknown>,
  graph: ReturnType<typeof buildNhm2TheoryBadgeGraphV1>,
): TheoryRuntimeMathTraceV1 | null {
  const existingTrace = asRecord(args.trace) ?? asRecord(args.runtime_math_trace) ?? asRecord(args.runtimeMathTrace);
  if (existingTrace && isTheoryRuntimeMathTraceV1(existingTrace)) return existingTrace;

  const badgeId = asNonEmptyString(args.badge_id ?? args.badgeId) ?? graph.badges[0]?.id;
  const badge = badgeId ? graph.badges.find((candidate: TheoryBadgeV1) => candidate.id === badgeId) ?? null : null;
  const family = asNonEmptyString(args.runtime_family ?? args.runtimeFamily ?? args.family);
  const traceInput = {
    graphId: graph.graphId,
    badgeIds: badge ? [badge.id] : badgeId ? [badgeId] : [],
    traceId: asNonEmptyString(args.trace_id ?? args.traceId) ?? undefined,
  };

  if (family === "casimir_field" || badgeLooksLikeCasimir(badge)) return buildStaticCasimirRuntimeTraceV1(traceInput);
  if (family === "solar_spectrum" || badgeLooksLikeSolar(badge)) return buildStaticSolarRuntimeTraceV1(traceInput);
  if (family === "gr_tensor" || family === "warp_full_solve" || badge) return buildStaticGrTensorTraceV1(traceInput);
  return null;
}

function scalarCutExpressionFromActionArgs(args: Record<string, unknown>): {
  expression: string | null;
  sourcePath: string | null;
  anchor: string | null;
} {
  const scalarCut = asRecord(args.scalar_cut ?? args.scalarCut);
  const expression =
    asNonEmptyString(args.expression ?? args.latex ?? args.display_latex ?? args.displayLatex) ??
    asNonEmptyString(scalarCut?.expression ?? scalarCut?.displayLatex ?? scalarCut?.display_latex);
  return {
    expression,
    sourcePath: asNonEmptyString(args.source_path ?? args.sourcePath),
    anchor: asNonEmptyString(args.anchor ?? args.scalar_cut_id ?? args.scalarCutId ?? scalarCut?.id),
  };
}

function claimBoundaryNotesForBadges(
  badges: Array<{ id: string; claimBoundary?: { diagnosticOnly?: boolean; validationClaimAllowed?: boolean; physicalMechanismClaimAllowed?: boolean; promotionAllowed?: boolean } }>,
): string[] {
  const notes = new Set<string>();
  for (const badge of badges) {
    if (badge.claimBoundary?.diagnosticOnly) notes.add(`${badge.id}: diagnostic-only badge`);
    if (badge.claimBoundary?.validationClaimAllowed === false) notes.add(`${badge.id}: validation claim not allowed`);
    if (badge.claimBoundary?.physicalMechanismClaimAllowed === false) {
      notes.add(`${badge.id}: physical mechanism claim not allowed`);
    }
    if (badge.claimBoundary?.promotionAllowed === false) notes.add(`${badge.id}: promotion not allowed`);
  }
  return Array.from(notes);
}

function postSituationThreadBinding(body: Record<string, unknown>): void {
  if (typeof fetch !== "function") return;
  void fetch("/api/agi/situation/thread-binding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

function postSituationGoalSession(body: Record<string, unknown>): void {
  if (typeof fetch !== "function") return;
  void fetch("/api/agi/situation/goal-session/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

function postLiveAnswerEnvironment(body: Record<string, unknown>): void {
  if (typeof fetch !== "function") return;
  void fetch("/api/agi/situation/live-answer-environment/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

function postLiveWorkstationPipeline(body: Record<string, unknown>): void {
  if (typeof fetch !== "function") return;
  void fetch("/api/agi/situation/live-workstation-pipeline/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

function postLiveEnvironmentControl(path: string, body?: Record<string, unknown>): void {
  if (typeof fetch !== "function") return;
  void fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => undefined);
}

function normalizeLiveCommentaryCadence(value: unknown): string {
  const text = asNonEmptyString(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  if (
    text === "off" ||
    text === "milestones_only" ||
    text === "anomalies_and_milestones" ||
    text === "windowed_companion" ||
    text === "active_dialogue" ||
    text === "continuous_debug"
  ) {
    return text;
  }
  if (text === "risk_and_progress" || text === "progress_and_risk") return "anomalies_and_milestones";
  if (text === "codex" || text === "codex_style" || text === "dialogue") return "active_dialogue";
  return "milestones_only";
}

function normalizeLiveCommentaryStatus(value: unknown, cadence: string): "active" | "paused" | "stopped" {
  const text = asNonEmptyString(value)?.toLowerCase();
  if (text === "active" || text === "paused" || text === "stopped") return text;
  return cadence === "off" ? "paused" : "active";
}

function normalizeLiveCommentaryVoiceMode(value: unknown): string | undefined {
  const text = asNonEmptyString(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  if (text === "text_only" || text === "voice_on_confirm" || text === "critical_voice" || text === "direct_address_only") {
    return text;
  }
  return undefined;
}

function postLiveCommentarySession(body: Record<string, unknown>): void {
  if (typeof fetch !== "function") return;
  void fetch("/api/agi/situation/live-commentary/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

function postLiveCommentarySessionWhenEnvironmentReady(body: Record<string, unknown>): void {
  if (typeof fetch !== "function") return;
  const explicitEnvironmentId = asNonEmptyString(body.environment_id);
  if (explicitEnvironmentId) {
    postLiveCommentarySession(body);
    return;
  }
  const threadId = asNonEmptyString(body.thread_id) ?? "helix-ask:desktop";
  const attempt = (remaining: number): void => {
    void fetch(`/api/agi/situation/live-answer-environment?thread_id=${encodeURIComponent(threadId)}&limit=1`)
      .then((response) => response.json())
      .then((payload: unknown) => {
        const record = asRecord(payload);
        const environment = asRecord(record?.environment);
        const environmentId = asNonEmptyString(environment?.environment_id);
        if (environmentId) {
          postLiveCommentarySession({ ...body, environment_id: environmentId });
          return;
        }
        if (remaining > 0) {
          globalThis.setTimeout(() => attempt(remaining - 1), 250);
        }
      })
      .catch(() => {
        if (remaining > 0) globalThis.setTimeout(() => attempt(remaining - 1), 250);
      });
  };
  attempt(12);
}

function postLiveAgenticReviewRequest(body: Record<string, unknown>): void {
  if (typeof fetch !== "function") return;
  void fetch("/api/agi/situation/live-agentic-review/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

function postLiveAgenticReviewRequestWhenEnvironmentReady(body: Record<string, unknown>): void {
  if (typeof fetch !== "function") return;
  const explicitEnvironmentId = asNonEmptyString(body.environment_id);
  if (explicitEnvironmentId) {
    postLiveAgenticReviewRequest(body);
    return;
  }
  const threadId = asNonEmptyString(body.thread_id) ?? "helix-ask:desktop";
  const attempt = (remaining: number): void => {
    void fetch(`/api/agi/situation/live-answer-environment?thread_id=${encodeURIComponent(threadId)}&limit=1`)
      .then((response) => response.json())
      .then((payload: unknown) => {
        const record = asRecord(payload);
        const environment = asRecord(record?.environment);
        const environmentId = asNonEmptyString(environment?.environment_id);
        if (environmentId) {
          postLiveAgenticReviewRequest({ ...body, environment_id: environmentId });
          return;
        }
        if (remaining > 0) globalThis.setTimeout(() => attempt(remaining - 1), 250);
      })
      .catch(() => {
        if (remaining > 0) globalThis.setTimeout(() => attempt(remaining - 1), 250);
      });
  };
  attempt(12);
}

function postCompanionPolicy(body: Record<string, unknown>): void {
  if (typeof fetch !== "function") return;
  void fetch("/api/agi/situation/companion-policy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

function postSituationMissionMemoryRefresh(body: Record<string, unknown>): void {
  if (typeof fetch !== "function") return;
  void fetch("/api/agi/situation/mission-memory/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

function postInterjectionInvestigation(body: Record<string, unknown>): void {
  if (typeof fetch !== "function") return;
  void fetch("/api/agi/situation/interjection-investigator/review-latest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

function normalizeSituationJobKind(value: unknown): SituationRoomJobKind | null {
  const text = asNonEmptyString(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  if (!text) return null;
  if (text === "translation") return "translate";
  if (text === "summary") return "rolling_summary";
  if (text === "actions" || text === "todos" || text === "todo") return "action_items";
  if (
    text === "translate" ||
    text === "rolling_summary" ||
    text === "action_items" ||
    text === "prompt_composer"
  ) {
    return text;
  }
  return null;
}

function normalizeSituationInputTextPolicy(value: unknown): SituationRoomJobInputTextPolicy | undefined {
  const text = asNonEmptyString(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  return text === "transcript_text" || text === "source_text_preferred" || text === "source_text_only"
    ? text
    : undefined;
}

function normalizeSituationOutputRenderPolicy(value: unknown): SituationRoomJobOutputRenderPolicy | undefined {
  const text = asNonEmptyString(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  return text === "target_language" || text === "native_language" || text === "dual" ? text : undefined;
}

function normalizeSituationGraphNodeType(value: unknown): SituationGraphNodeType | null {
  const text = asNonEmptyString(value);
  const allowed = new Set<SituationGraphNodeType>([
    "source.audio.mic",
    "source.audio.display",
    "source.screen",
    "speaker.identity",
    "speaker.filter",
    "transcript.buffer",
    "language.detect",
    "translate",
    "helix.reason",
    "helix.interjection_gate",
    "output.voice",
    "output.panel",
    "output.note",
    "output.history",
  ]);
  return text && allowed.has(text as SituationGraphNodeType) ? (text as SituationGraphNodeType) : null;
}

function normalizeSituationGraphColumn(value: unknown): SituationGraphNodeColumn | undefined {
  const text = asNonEmptyString(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  return text === "sources" || text === "speakers" || text === "jobs" || text === "outputs" || text === "helix"
    ? text
    : undefined;
}

function normalizeSituationGraphStatus(value: unknown): SituationGraphNodeStatus | undefined {
  const text = asNonEmptyString(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  return text === "idle" || text === "active" || text === "running" || text === "blocked" || text === "complete" || text === "error"
    ? text
    : undefined;
}

function normalizeSituationGraphLane(value: unknown): SituationGraphLane | null {
  const text = asNonEmptyString(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  return text === "audio" ||
    text === "speaker_identity" ||
    text === "transcript" ||
    text === "translation" ||
    text === "context" ||
    text === "command" ||
    text === "voice_output" ||
    text === "receipt" ||
    text === "monitor_signal"
    ? text
    : null;
}

function resolveSituationRoom(args: Record<string, unknown>, options?: { createIfMissing?: boolean }): SituationRoom | null {
  const situationState = useSituationRoomStore.getState();
  const explicitRoomId = asNonEmptyString(args.room_id ?? args.roomId);
  if (explicitRoomId && situationState.rooms[explicitRoomId]) return situationState.rooms[explicitRoomId];

  const title = asNonEmptyString(args.title ?? args.room_title ?? args.roomTitle ?? args.label);
  if (title) {
    const normalizedTitle = title.toLowerCase();
    const foundId = situationState.room_order.find((roomId) => {
      const room = situationState.rooms[roomId];
      return room?.title.trim().toLowerCase() === normalizedTitle;
    });
    if (foundId) return situationState.rooms[foundId] ?? null;
  }

  if (situationState.active_room_id && situationState.rooms[situationState.active_room_id]) {
    return situationState.rooms[situationState.active_room_id];
  }

  const firstRoomId = situationState.room_order[0];
  if (firstRoomId && situationState.rooms[firstRoomId]) return situationState.rooms[firstRoomId];

  return options?.createIfMissing
    ? useSituationRoomStore.getState().createRoom(title ?? "Situation Room")
    : null;
}

function resolveSituationSourceIds(room: SituationRoom, args: Record<string, unknown>): string[] {
  const situationState = useSituationRoomStore.getState();
  const requested = asStringArray(args.source_ids ?? args.sourceIds ?? args.source_id ?? args.sourceId);
  if (requested.length > 0) return requested.filter((sourceId) => Boolean(situationState.sources[sourceId]));
  return room.source_ids.filter((sourceId) => Boolean(situationState.sources[sourceId]));
}

function summarizeSituationRoom(room: SituationRoom): Record<string, unknown> {
  const state = useSituationRoomStore.getState();
  const sources = room.source_ids
    .map((sourceId) => state.sources[sourceId])
    .filter((source): source is SituationRoomSource => Boolean(source));
  return {
    room_id: room.room_id,
    title: room.title,
    status: room.status,
    source_count: sources.length,
    event_count: room.event_ids.length,
    transcript_count: selectSituationRoomEvents(state, room.room_id).filter(
      (event) => event.event_type === "voice_transcript",
    ).length,
    sources: sources.map((source) => ({
      source_id: source.source_id,
      label: source.label,
      status: source.status,
      capture_source: source.capture_source,
      chunk_index: source.chunk_index,
    })),
  };
}

function buildDeterministicNoteId(title: string, existingIds: string[]): string {
  const base = slugify(title) || "untitled-note";
  const stem = `note:${base}`;
  if (!existingIds.includes(stem)) return stem;
  let index = 2;
  while (existingIds.includes(`${stem}-${index}`)) index += 1;
  return `${stem}-${index}`;
}

function normalizeDocRoute(value: string): string {
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) return "";
  return `/${normalized.startsWith("docs/") ? normalized : `docs/${normalized}`}`.replace(/\/{2,}/g, "/");
}

function tokenizeDocTopic(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !["the", "doc", "docs", "document", "paper", "latest", "newest", "recent"].includes(token));
}

function searchDocManifest(query: string, limit = 8) {
  const tokens = tokenizeDocTopic(query);
  if (tokens.length === 0) return [];
  return DOC_MANIFEST
    .map((entry) => {
      const searchText = entry.searchText.toLowerCase();
      const score = tokens.reduce((sum, token) => sum + (searchText.includes(token) ? 1 : 0), 0);
      return { entry, score: score + (/\blatest\b/i.test(entry.relativePath) ? 0.25 : 0) };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.route.localeCompare(b.entry.route))
    .slice(0, Math.max(1, Math.min(24, limit)));
}

function resolveNoteId(args: Record<string, unknown>, options?: { allowActiveFallback?: boolean }): string | null {
  const notesState = useWorkstationNotesStore.getState();
  const directId = asNonEmptyString(args.note_id ?? args.id);
  if (directId && notesState.notes[directId]) return directId;
  const targetTitle = asNonEmptyString(args.title ?? args.note_title ?? args.name);
  if (targetTitle) {
    const needle = targetTitle.trim().toLowerCase();
    const foundId = notesState.order.find((id) => {
      const note = notesState.notes[id];
      return note?.title?.trim().toLowerCase() === needle;
    });
    if (foundId) return foundId;
  }
  if (options?.allowActiveFallback && notesState.active_note_id && notesState.notes[notesState.active_note_id]) {
    return notesState.active_note_id;
  }
  return null;
}

function requireConfirmation(
  request: HelixPanelActionRequest,
  panelId: string,
  actionId: string,
  actionLabel: string,
): HelixPanelActionExecutionResult | null {
  const args = asRecord(request.args) ?? {};
  const confirmed = asBoolean(args.confirmed ?? args.confirm ?? args.approved);
  if (confirmed === true) return null;
  return {
    ok: false,
    panel_id: panelId,
    action_id: actionId,
    message: `${actionLabel} requires confirmation. Re-run with args.confirmed=true.`,
    artifact: {
      requires_confirmation: true,
      action_id: actionId,
    },
  };
}

function buildWorkspaceActionReceipt(panelId: string, actionId: string): Record<string, unknown> {
  return {
    kind: "workspace_action_receipt",
    schema: "helix.workspace_action_receipt.v1",
    panel_id: panelId,
    action_id: actionId,
    status: "completed",
    state_observed: true,
    assistant_answer: false,
    raw_content_included: false,
  };
}

function buildInterfaceLanguagePreferenceReceipt(
  panelId: string,
  actionId: string,
  option: {
    code: string;
    label: string;
    nativeLabel: string;
    bcp47: string;
    translationMode: string;
    readiness: string;
  },
): Record<string, unknown> {
  return {
    ...buildWorkspaceActionReceipt(panelId, actionId),
    preference_key: "interfaceLanguage",
    language: option.code,
    bcp47: option.bcp47,
    label: option.label,
    native_label: option.nativeLabel,
    translation_mode: option.translationMode,
    readiness: option.readiness,
    source: "workstation_action",
  };
}

function buildRuntimeDocsObservationArtifact(args: {
  actionId: "summarize_doc" | "summarize_section" | "explain_paper" | "locate_in_doc";
  path: string;
  anchor: string | null;
  selectedText: string | null;
  query: string | null;
  decisionRef: string | null;
}): Record<string, unknown> {
  const route = normalizeDocRoute(args.path);
  const entry = findDocEntry(route);
  const observationScope = args.decisionRef ? "runtime_selected_capability" : "manual_panel_action";
  if (args.actionId === "locate_in_doc") {
    const hasSelectedMatch =
      Boolean(args.selectedText) &&
      Boolean(args.query) &&
      args.selectedText!.toLowerCase().includes(args.query!.toLowerCase());
    return {
      schema: "helix.doc_location_matches.v1",
      kind: "doc_location_matches",
      source: "docs_viewer_runtime_adapter",
      decision_ref: args.decisionRef,
      observation_scope: observationScope,
      runtime_owned: Boolean(args.decisionRef),
      path: route,
      title: entry?.title ?? null,
      anchor: args.anchor,
      query: args.query,
      matches: hasSelectedMatch
        ? [
            {
              path: route,
              anchor: args.anchor,
              snippet: args.selectedText,
              source: "selected_text",
            },
          ]
        : [],
      adapter_note: hasSelectedMatch
        ? "Matched against selected text in the current Docs Viewer context."
        : "Docs Viewer adapter returned a same-turn location observation without launching a nested Ask turn.",
      same_turn_observation: true,
      nested_ask_launch: false,
      launched_prompt: false,
      manual_ui_launch_only: false,
      assistant_answer: false,
      raw_content_included: false,
    };
  }
  const selectedTextSummary = args.selectedText
    ? args.selectedText.length > 360
      ? `${args.selectedText.slice(0, 357)}...`
      : args.selectedText
    : null;
  const modeLabel =
    args.actionId === "summarize_section"
      ? "section summary"
      : args.actionId === "explain_paper"
        ? "paper explanation"
        : "document summary";
  return {
    schema: "helix.doc_summary.v1",
    kind: "doc_summary",
    source: "docs_viewer_runtime_adapter",
    decision_ref: args.decisionRef,
    observation_scope: observationScope,
    runtime_owned: Boolean(args.decisionRef),
    mode: args.actionId,
    path: route,
    title: entry?.title ?? null,
    anchor: args.anchor,
    selected_text: selectedTextSummary,
    summary_text: selectedTextSummary
      ? `${modeLabel}: ${selectedTextSummary}`
      : `${modeLabel}: ${entry?.title ?? route}`,
    adapter_note: "Docs Viewer adapter returned a same-turn doc summary observation without launching a nested Ask turn.",
    same_turn_observation: true,
    nested_ask_launch: false,
    launched_prompt: false,
    manual_ui_launch_only: false,
    assistant_answer: false,
    raw_content_included: false,
  };
}

export function executeHelixPanelAction(
  request: HelixPanelActionRequest,
  context: HelixPanelActionExecutionContext,
): HelixPanelActionExecutionResult {
  const panelId = request.panel_id?.trim();
  const actionId = request.action_id?.trim().toLowerCase();
  if (!panelId || !actionId) {
    return {
      ok: false,
      panel_id: request.panel_id || "",
      action_id: request.action_id || "",
      message: "panel_id and action_id are required.",
    };
  }

  if (actionId === "open") {
    context.openPanel(panelId, undefined);
    context.focusPanel(panelId, undefined);
    return {
      ok: true,
      panel_id: panelId,
      action_id: actionId,
      artifact: buildWorkspaceActionReceipt(panelId, actionId),
    };
  }

  if (actionId === "focus") {
    context.focusPanel(panelId, undefined);
    return {
      ok: true,
      panel_id: panelId,
      action_id: actionId,
      artifact: buildWorkspaceActionReceipt(panelId, actionId),
    };
  }

  if (actionId === "close") {
    context.closePanel(panelId, undefined);
    return {
      ok: true,
      panel_id: panelId,
      action_id: actionId,
      artifact: buildWorkspaceActionReceipt(panelId, actionId),
    };
  }

  if (panelId === "narrator") {
    const args = asRecord(request.args) ?? {};
    const narratorStore = useNarratorStore.getState();

    if (actionId === "narrator.set_source_policy") {
      const sourceKind = asNarratorSourceKind(args.source_kind ?? args.sourceKind);
      if (!sourceKind) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "narrator.set_source_policy requires a valid source_kind.",
        };
      }
      const deliveryMode = asNarratorDeliveryMode(args.delivery_mode ?? args.deliveryMode);
      const maxChars = asNumber(args.max_chars ?? args.maxChars);
      const cooldownMs = asNumber(args.cooldown_ms ?? args.cooldownMs);
      narratorStore.setSourcePolicy(sourceKind, {
        ...(asBoolean(args.enabled) !== null ? { enabled: asBoolean(args.enabled) === true } : {}),
        ...(deliveryMode ? { deliveryMode } : {}),
        ...(maxChars !== null ? { maxChars: Math.max(1, Math.floor(maxChars)) } : {}),
        ...(cooldownMs !== null ? { cooldownMs: Math.max(0, Math.floor(cooldownMs)) } : {}),
      });
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "narrator_source_policy_receipt",
          schema: "helix.narrator_source_policy_receipt.v1",
          source_kind: sourceKind,
          policy: useNarratorStore.getState().sourcePolicies[sourceKind],
          assistant_answer: false,
          raw_content_included: false,
          terminal_eligible: false,
          panel_generated_answer: false,
        },
      };
    }

    if (actionId === "narrator.confirm_speak_event") {
      const eventId = asNonEmptyString(args.event_id ?? args.eventId);
      const event = eventId ? narratorStore.events.find((entry) => entry.eventId === eventId) : null;
      if (!eventId || !event) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "narrator.confirm_speak_event requires an existing event_id.",
        };
      }
      narratorStore.markQueued(eventId);
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "narrator_confirm_speak_receipt",
          schema: "helix.narrator_confirm_speak_receipt.v1",
          event_id: eventId,
          source_kind: event.sourceKind,
          source_id: event.sourceId,
          speakable: event.speakable,
          output_authority: "operator_confirmed_narrator_event",
          evidence_refs: event.evidenceRefs,
          assistant_answer: false,
          raw_content_included: false,
          terminal_eligible: false,
          panel_generated_answer: false,
        },
      };
    }

    if (actionId === "narrator.say") {
      const nowMs = Date.now();
      const text = asNonEmptyString(args.text);
      if (!text) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "narrator.say requires text.",
        };
      }
      const sourceKind = asNarratorSourceKind(args.source_kind ?? args.sourceKind) ?? "helix_console";
      const sourceId = asNonEmptyString(args.source_id ?? args.sourceId) ?? "helix_ask:narrator.say";
      const requestedDeliveryMode = asNarratorDeliveryMode(args.delivery_mode ?? args.deliveryMode) ?? "confirm_to_speak";
      const evidenceRefs = asStringArray(args.evidence_refs ?? args.evidenceRefs);
      const event = narratorStore.publishEvent({
        sourceKind,
        sourceId,
        sourceLabelMessageId: sourceKind === "helix_console" ? "narrator.source.helixConsole" : undefined,
        text,
        language: asNonEmptyString(args.language) ?? undefined,
        authority: "tool_evidence",
        assistant_answer: false,
        terminal_eligible: false,
        certainty: "medium",
        evidenceRefs: evidenceRefs.length > 0 ? evidenceRefs : [sourceId],
        traceId: asNonEmptyString(args.trace_id ?? args.traceId) ?? `narrator:say:${nowMs}`,
        rawContentIncluded: false,
        speakable: true,
        requestedDeliveryMode: requestedDeliveryMode === "hidden" ? "visible_only" : requestedDeliveryMode,
        defaultDeliveryMode: "visible_only",
        dedupeKey: asNonEmptyString(args.dedupe_key ?? args.dedupeKey) ?? undefined,
      }, { voiceArmed: requestedDeliveryMode === "auto_speak", nowMs });
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "narrator_say_receipt",
          schema: "helix.narrator_say_receipt.v1",
          event_id: event?.eventId ?? null,
          published: Boolean(event),
          source_kind: sourceKind,
          source_id: sourceId,
          delivery_mode: requestedDeliveryMode,
          priority: asNonEmptyString(args.priority) ?? "normal",
          output_authority: "narrator_router_observation",
          evidence_refs: evidenceRefs,
          assistant_answer: false,
          raw_content_included: false,
          terminal_eligible: false,
          panel_generated_answer: false,
        },
      };
    }

    if (actionId === "narrator.bind_stream") {
      const sourceRef = asNonEmptyString(args.source_ref ?? args.sourceRef);
      const streamKind = asNarratorStreamKind(args.stream_kind ?? args.streamKind);
      if (!sourceRef || !streamKind) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "narrator.bind_stream requires source_ref and stream_kind.",
        };
      }
      const deliveryMode = asNarratorDeliveryMode(args.delivery_mode ?? args.deliveryMode) ?? "visible_only";
      const voicePolicy = asNonEmptyString(args.voice_policy ?? args.voicePolicy) ?? "confirm_speak_required";
      const sourceKind: NarratorSourceKind =
        streamKind === "translated_transcript" || streamKind === "translated_speech" || streamKind === "transcript_stream"
          ? "situation_room"
          : "workstation_panel";
      narratorStore.setSourcePolicy(sourceKind, {
        enabled: true,
        deliveryMode: deliveryMode === "hidden" ? "visible_only" : deliveryMode,
      });
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "narrator_bind_stream_receipt",
          schema: "helix.narrator_bind_stream_receipt.v1",
          source_ref: sourceRef,
          stream_kind: streamKind,
          preset_id: asNonEmptyString(args.preset_id ?? args.presetId),
          delivery_mode: deliveryMode,
          voice_policy: voicePolicy,
          evidence_threshold: asNonEmptyString(args.evidence_threshold ?? args.evidenceThreshold),
          bound_source_kind: sourceKind,
          output_authority: "narrator_stream_binding_observation",
          assistant_answer: false,
          raw_content_included: false,
          terminal_eligible: false,
          panel_generated_answer: false,
        },
      };
    }

    if (actionId === "narrator.debug_auto_speak_probe") {
      const nowMs = Date.now();
      const text =
        asNonEmptyString(args.text) ??
        "Narrator debug probe. This should route through the existing voice stack when auto-speak is eligible.";
      const traceId = asNonEmptyString(args.trace_id ?? args.traceId) ?? `narrator:debug:${nowMs}`;
      const event = narratorStore.publishEvent({
        sourceKind: "workstation_panel",
        sourceId: "panel:narrator:debug_probe",
        sourceLabelMessageId: "narrator.source.workstationPanel",
        text,
        authority: "panel_observation",
        assistant_answer: false,
        terminal_eligible: false,
        certainty: "low",
        evidenceRefs: ["narrator:debug_probe"],
        traceId,
        rawContentIncluded: false,
        speakable: true,
        requestedDeliveryMode: "auto_speak",
        defaultDeliveryMode: "visible_only",
      }, { voiceArmed: true, nowMs });
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "narrator_debug_auto_speak_probe_receipt",
          schema: "helix.narrator_debug_auto_speak_probe_receipt.v1",
          event_id: event?.eventId ?? null,
          published: Boolean(event),
          source_kind: "workstation_panel",
          source_id: "panel:narrator:debug_probe",
          trace_id: traceId,
          output_authority: "narrator_router_observation",
          assistant_answer: false,
          raw_content_included: false,
          terminal_eligible: false,
          panel_generated_answer: false,
        },
      };
    }

    if (actionId === "narrator.clear_feed") {
      narratorStore.clearFeed();
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "narrator_clear_feed_receipt",
          schema: "helix.narrator_clear_feed_receipt.v1",
          assistant_answer: false,
          raw_content_included: false,
          terminal_eligible: false,
          panel_generated_answer: false,
        },
      };
    }
  }

  if (panelId === "workstation-process-graph") {
    const args = asRecord(request.args) ?? {};
    const graphStore = useWorkstationProcessGraphStore.getState();
    const maxNodes = asNumber(args.max_nodes ?? args.maxNodes) ?? undefined;
    const scope = asNonEmptyString(args.scope)?.toLowerCase();
    const includeTimeline = asBoolean(args.include_timeline ?? args.includeTimeline) ?? true;
    const includeArtifacts = asBoolean(args.include_artifacts ?? args.includeArtifacts) ?? true;

    if (actionId === "get_snapshot") {
      if (scope === "compact" || scope === "context_pack") {
        return {
          ok: true,
          panel_id: panelId,
          action_id: actionId,
          artifact: graphStore.getContextPack({
            maxActive: maxNodes,
            maxArtifacts: asNumber(args.max_artifacts ?? args.maxArtifacts) ?? undefined,
            maxTimeline: includeTimeline ? asNumber(args.max_timeline ?? args.maxTimeline) ?? undefined : 0,
          }) as unknown as Record<string, unknown>,
          message: "Returned compact workstation process graph context pack.",
        };
      }
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: graphStore.getSnapshotArtifact({ maxNodes, includeTimeline, includeArtifacts }) as unknown as Record<string, unknown>,
        message: "Returned workstation process graph snapshot.",
      };
    }

    if (actionId === "get_context_pack") {
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: graphStore.getContextPack({
          maxActive: maxNodes,
          maxArtifacts: asNumber(args.max_artifacts ?? args.maxArtifacts) ?? undefined,
          maxTimeline: includeTimeline ? asNumber(args.max_timeline ?? args.maxTimeline) ?? undefined : 0,
        }) as unknown as Record<string, unknown>,
        message: "Returned compact workstation process graph context pack.",
      };
    }

    if (actionId === "query_snapshot") {
      const query = asNonEmptyString(args.query ?? args.filter);
      if (!query) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "workstation-process-graph.query_snapshot requires query.",
        };
      }
      const snapshot = graphStore.getSnapshotArtifact({ maxNodes, includeTimeline, includeArtifacts });
      const needle = query.toLowerCase();
      const nodes = snapshot.nodes.filter((node) =>
        [node.id, node.kind, node.label, node.status, node.panelId, node.traceId, node.jobId]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle)),
      );
      const nodeIds = new Set(nodes.map((node) => node.id));
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          ...snapshot,
          query,
          nodes,
          edges: snapshot.edges.filter((edge) => nodeIds.has(edge.from) || nodeIds.has(edge.to)),
          timeline: snapshot.timeline.filter((entry) =>
            [entry.label, entry.traceId, ...(entry.nodeIds ?? [])]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(needle)),
          ),
        },
        message: `Returned process graph query snapshot for "${query}".`,
      };
    }

    if (actionId === "focus_node") {
      const nodeId = asNonEmptyString(args.node_id ?? args.nodeId);
      if (!nodeId) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "workstation-process-graph.focus_node requires node_id.",
        };
      }
      graphStore.focusNode(nodeId);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: { kind: "workstation_process_graph_view_receipt", focused_node_id: nodeId },
        message: `Focused process graph node ${nodeId}.`,
      };
    }

    if (actionId === "filter_view") {
      const filter = asNonEmptyString(args.filter ?? args.query);
      graphStore.filterView(filter ?? undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: { kind: "workstation_process_graph_view_receipt", filter: filter ?? null },
        message: filter ? `Filtered process graph by "${filter}".` : "Cleared process graph filter.",
      };
    }

    if (actionId === "export_svg") {
      const mode = asNonEmptyString(args.mode) === "ambient" ? "ambient" : "panel";
      const graph = graphStore.graph;
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "workstation_process_graph_svg",
          schemaVersion: "helix.workstation.process_graph.svg/v1",
          sessionId: graph.sessionId,
          generatedAt: new Date().toISOString(),
          mode,
          svg: renderWorkstationProcessGraphSvg({
            graph,
            density: mode,
            labels: mode === "ambient" ? "minimal" : "full",
            maxNodes: maxNodes ?? (mode === "ambient" ? 18 : 160),
          }),
        },
        message: "Exported process graph SVG.",
      };
    }

    if (actionId === "clear_historical") {
      graphStore.clearHistorical();
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: { kind: "workstation_process_graph_view_receipt", cleared_historical: true },
        message: "Pruned historical process graph state.",
      };
    }
  }

  if (panelId === "docs-viewer" && (actionId === "open_doc" || actionId === "open_doc_by_path")) {
    const args = asRecord(request.args) ?? {};
    const path = asNonEmptyString(args.path ?? args.doc_path ?? args.target);
    const anchor = asNonEmptyString(args.anchor);
    if (!path) {
      return {
        ok: false,
        panel_id: panelId,
        action_id: actionId,
        message: "docs-viewer.open_doc requires a path.",
      };
    }
    context.openPanel("docs-viewer", undefined);
    context.focusPanel("docs-viewer", undefined);
    const route = normalizeDocRoute(path);
    openDocPanel(anchor ? { path: route, anchor } : { path: route });
    return {
      ok: true,
      panel_id: panelId,
      action_id: actionId,
      artifact: { path: route, anchor: anchor ?? null },
      message: `Opened document: ${route}`,
    };
  }

  if (panelId === "docs-viewer" && actionId === "open_latest_doc_by_topic") {
    const args = asRecord(request.args) ?? {};
    const topic = asNonEmptyString(args.topic ?? args.query ?? args.target);
    const providedPath = asNonEmptyString(args.path ?? args.doc_path);
    if (!topic && !providedPath) {
      return {
        ok: false,
        panel_id: panelId,
        action_id: actionId,
        message: "docs-viewer.open_latest_doc_by_topic requires a topic or resolved path.",
      };
    }
    const route =
      providedPath ? normalizeDocRoute(providedPath) : searchDocManifest(topic ?? "", 1)[0]?.entry.route ?? null;
    if (!route) {
      return {
        ok: false,
        panel_id: panelId,
        action_id: actionId,
        artifact: { topic: topic ?? null, candidates: [] },
        message: `No local docs matched topic: ${topic ?? "unknown"}.`,
      };
    }
    context.openPanel("docs-viewer", undefined);
    context.focusPanel("docs-viewer", undefined);
    openDocPanel({ path: route });
    return {
      ok: true,
      panel_id: panelId,
      action_id: actionId,
      artifact: { topic: topic ?? null, path: route },
      message: topic ? `Opened latest ${topic} document: ${route}` : `Opened document: ${route}`,
    };
  }

  if (panelId === "docs-viewer" && actionId === "search_docs") {
    const args = asRecord(request.args) ?? {};
    const query = asNonEmptyString(args.query ?? args.topic ?? args.target);
    if (!query) {
      return {
        ok: false,
        panel_id: panelId,
        action_id: actionId,
        message: "docs-viewer.search_docs requires query.",
      };
    }
    const limitRaw = typeof args.limit === "number" ? args.limit : 8;
    const matches = searchDocManifest(query, limitRaw).map(({ entry }) => ({
      path: entry.route,
      title: entry.title,
    }));
    return {
      ok: true,
      panel_id: panelId,
      action_id: actionId,
      artifact: { query, matches },
      message: matches.length
        ? `Found ${matches.length} doc(s): ${matches.map((entry) => entry.path).join(", ")}`
        : `No docs matched: ${query}`,
    };
  }

  if (panelId === "docs-viewer" && actionId === "open_doc_and_read") {
    const args = asRecord(request.args) ?? {};
    const path = asNonEmptyString(args.path ?? args.doc_path ?? args.target);
    const anchor = asNonEmptyString(args.anchor);
    if (!path) {
      return {
        ok: false,
        panel_id: panelId,
        action_id: actionId,
        message: "docs-viewer.open_doc_and_read requires a path.",
      };
    }
    context.openPanel("docs-viewer", undefined);
    context.focusPanel("docs-viewer", undefined);
    openDocPanel(anchor ? { path, anchor, autoRead: true } : { path, autoRead: true });
    return {
      ok: true,
      panel_id: panelId,
      action_id: actionId,
      artifact: { path, anchor: anchor ?? null, autoRead: true },
    };
  }

  if (panelId === "docs-viewer" && actionId === "open_directory") {
    useDocViewerStore.getState().viewDirectory();
    context.openPanel("docs-viewer", undefined);
    context.focusPanel("docs-viewer", undefined);
    return {
      ok: true,
      panel_id: panelId,
      action_id: actionId,
      artifact: { mode: "directory" },
    };
  }

  if (panelId === "docs-viewer" && (actionId === "identify_current_doc" || actionId === "verify_active_doc")) {
    const store = useDocViewerStore.getState();
    const path = asNonEmptyString(store.currentPath);
    const anchor = asNonEmptyString(store.anchor);
    const entry = findDocEntry(path);
    return {
      ok: true,
      panel_id: panelId,
      action_id: actionId,
      artifact: {
        path: path ?? null,
        anchor: anchor ?? null,
        mode: store.mode,
        title: entry?.title ?? null,
        has_doc_context: Boolean(path),
      },
      message: path ? `Current document: ${path}` : "No active document in Docs Viewer.",
    };
  }

  if (
    panelId === "docs-viewer" &&
    (actionId === "summarize_doc" || actionId === "summarize_section" || actionId === "explain_paper" || actionId === "locate_in_doc")
  ) {
    const args = asRecord(request.args) ?? {};
    const store = useDocViewerStore.getState();
    const path =
      asNonEmptyString(args.path ?? args.doc_path ?? args.target) ??
      asNonEmptyString(store.currentPath);
    const anchor = asNonEmptyString(args.anchor) ?? asNonEmptyString(store.anchor);
    const selectedText = asNonEmptyString(args.selected_text ?? args.selection_text ?? args.selection);
    const query = asNonEmptyString(args.query ?? args.topic ?? args.find);
    const decisionRef = asNonEmptyString(args.agent_step_decision_ref ?? args.decision_ref ?? args.runtime_decision_ref);
    if (!path) {
      return {
        ok: false,
        panel_id: panelId,
        action_id: actionId,
        message: "No active docs context to summarize/explain.",
      };
    }
    if (actionId === "locate_in_doc" && !query) {
      return {
        ok: false,
        panel_id: panelId,
        action_id: actionId,
        message: "docs-viewer.locate_in_doc requires query.",
      };
    }
    return {
      ok: true,
      panel_id: panelId,
      action_id: actionId,
      artifact: buildRuntimeDocsObservationArtifact({
        actionId,
        path,
        anchor,
        selectedText,
        query,
        decisionRef: decisionRef ?? null,
      }),
      message:
        actionId === "summarize_section"
          ? "Returned same-turn document section summary observation."
          : actionId === "explain_paper"
            ? "Returned same-turn paper explanation observation."
            : actionId === "locate_in_doc"
              ? "Returned same-turn document location observation."
              : "Returned same-turn document summary observation.",
    };
  }

  if (panelId === "agi-essence-console" && actionId === "open_settings") {
    const args = asRecord(request.args) ?? {};
    const tabRaw = asNonEmptyString(args.tab);
    const tab: SettingsTab = tabRaw === "knowledge" ? "knowledge" : "preferences";
    context.openSettings(tab);
    return {
      ok: true,
      panel_id: panelId,
      action_id: actionId,
      artifact: { tab },
    };
  }

  if (panelId === "account-session" && actionId === "set_interface_language") {
    const args = asRecord(request.args) ?? {};
    const language = args.language ?? args.interface_language ?? args.interfaceLanguage;
    const writeResult = writeInterfaceLanguagePreference(language, "workstation_action");
    if (!writeResult.ok) {
      return {
        ok: false,
        panel_id: panelId,
        action_id: actionId,
        message: "account-session.set_interface_language requires a supported language code.",
        artifact: {
          kind: "workspace_action_receipt",
          schema: "helix.workspace_action_receipt.v1",
          panel_id: panelId,
          action_id: actionId,
          status: "failed",
          state_observed: true,
          assistant_answer: false,
          raw_content_included: false,
          reason: writeResult.reason,
          language: writeResult.language,
          supported_languages: [...SHARED_INTERFACE_LANGUAGE_CODES],
        },
      };
    }

    context.openPanel("account-session", undefined);
    context.focusPanel("account-session", undefined);
    pushWorkstationDebugEvent({
      channel: "account_session",
      action: "interface_language.changed",
      detail: {
        language: writeResult.option.code,
        bcp47: writeResult.option.bcp47,
        label: writeResult.option.label,
        source: "workstation_action",
      },
    });
    return {
      ok: true,
      panel_id: panelId,
      action_id: actionId,
      artifact: buildInterfaceLanguagePreferenceReceipt(panelId, actionId, writeResult.option),
      message: `Interface language set to ${writeResult.option.label}.`,
    };
  }

  if (panelId === "workstation-notes") {
    const args = asRecord(request.args) ?? {};
    const notesState = useWorkstationNotesStore.getState();
    if (actionId === "create_note") {
      const title = asNonEmptyString(args.title ?? args.name) ?? "Untitled note";
      const topic = asNonEmptyString(args.topic) ?? title;
      const body = asNonEmptyString(args.body) ?? "";
      const explicitId = asNonEmptyString(args.note_id);
      const noteId =
        explicitId && !notesState.notes[explicitId]
          ? explicitId
          : buildDeterministicNoteId(title, Object.keys(notesState.notes));
      const note = notesState.upsertWorkflowNote({
        id: noteId,
        title,
        topic,
        body,
        citations: [],
        snippets: [],
      });
      context.openPanel("workstation-notes", undefined);
      context.focusPanel("workstation-notes", undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          note_id: note.id,
          title: note.title,
          active_note_id: note.id,
          created: true,
        },
      };
    }

    if (actionId === "append_to_note") {
      const text = asNonEmptyString(args.text ?? args.content ?? args.append);
      if (!text) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "workstation-notes.append_to_note requires text.",
        };
      }
      let noteId = resolveNoteId(args, { allowActiveFallback: true });
      let created = false;
      if (!noteId) {
        const createIfMissing = asBoolean(args.create_if_missing ?? args.createIfMissing) === true;
        const fallbackTitle = asNonEmptyString(args.title ?? args.name);
        if (!createIfMissing) {
          return {
            ok: false,
            panel_id: panelId,
            action_id: actionId,
            message: "Note target unresolved. Provide note_id/title, select an active note, or explicitly set create_if_missing=true.",
            artifact: {
              kind: "note_mutation_failure",
              schema: "helix.note_mutation_failure.v1",
              error_code: "note_target_unresolved",
              requires_user_input: ["note_id", "title"],
              mutation_applied: false,
              requested_action: "append_to_note",
              requested_text: text,
            },
          };
        }
        const fallback = notesState.upsertWorkflowNote({
          id: buildDeterministicNoteId(fallbackTitle ?? "Untitled note", Object.keys(notesState.notes)),
          title: fallbackTitle ?? "Untitled note",
          topic: asNonEmptyString(args.topic) ?? "general",
          body: "",
          citations: [],
          snippets: [],
        });
        noteId = fallback.id;
        created = true;
      }
      const current = useWorkstationNotesStore.getState().notes[noteId];
      const nextBody = current?.body ? `${current.body.replace(/\s+$/g, "")}\n${text}` : text;
      notesState.updateNoteBody(noteId, nextBody);
      notesState.setActiveNote(noteId);
      context.openPanel("workstation-notes", undefined);
      context.focusPanel("workstation-notes", undefined);
      const updated = useWorkstationNotesStore.getState().notes[noteId];
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          note_id: noteId,
          title: updated?.title ?? null,
          appended_text: text,
          body_length: updated?.body.length ?? nextBody.length,
          created_note: created,
        },
      };
    }

    if (actionId === "create_live_note_sink" || actionId === "append_live_note_chunk") {
      const title = asNonEmptyString(args.title) ?? "Live source note";
      const topic = asNonEmptyString(args.topic) ?? "live-source";
      const noteId = asNonEmptyString(args.note_id) ?? buildDeterministicNoteId(title, Object.keys(notesState.notes));
      const chunk = asNonEmptyString(args.chunk_text ?? args.text) ?? "";
      const traceId = asNonEmptyString(args.trace_id) ?? `live-note:${noteId}:${Date.now()}`;
      const note = actionId === "append_live_note_chunk"
        ? notesState.appendLiveNoteChunk({
            note_id: noteId,
            title,
            topic,
            chunk_text: chunk,
            trace_id: traceId,
            citation: {
              id: `citation:${traceId}`,
              path: `live-pipeline://${traceId}`,
              heading: "Live pipeline transform",
              start_offset: 0,
              end_offset: chunk.length,
            },
            snippet: {
              id: `snippet:${traceId}`,
              citation_id: `citation:${traceId}`,
              excerpt: chunk.slice(0, 240),
            },
          })
        : notesState.upsertWorkflowNote({
            id: noteId,
            title,
            topic,
            body: "",
            citations: [],
            snippets: [],
            trace_id: traceId,
          });
      context.openPanel("workstation-notes", undefined);
      context.focusPanel("workstation-notes", undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "live_output_sink_receipt",
          schema: "helix.live_output_sink_receipt.v1",
          sink_id: `sink:${note.id}`,
          pipeline_id: asNonEmptyString(args.pipeline_id) ?? "client_live_note_sink",
          target_id: note.id,
          ok: true,
          action: actionId === "append_live_note_chunk" ? "append" : "replace_section",
          written_chars: actionId === "append_live_note_chunk" ? chunk.length : 0,
          source_event_ids: [],
          evidence_refs: [`note:${note.id}`, `trace:${traceId}`],
          raw_transcript_included: false,
        },
        message: actionId === "append_live_note_chunk" ? `Appended live chunk to ${note.title}.` : `Created live note sink ${note.title}.`,
      };
    }

    if (actionId === "set_active_note") {
      const noteId = resolveNoteId(args);
      if (!noteId) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "Note not found. Provide note_id or note title.",
        };
      }
      notesState.setActiveNote(noteId);
      context.openPanel("workstation-notes", undefined);
      context.focusPanel("workstation-notes", undefined);
      const note = useWorkstationNotesStore.getState().notes[noteId];
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          note_id: noteId,
          title: note?.title ?? null,
          active_note_id: noteId,
        },
      };
    }

    if (actionId === "rename_note") {
      const nextTitle = asNonEmptyString(args.title ?? args.new_title ?? args.to_title ?? args.name);
      if (!nextTitle) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "workstation-notes.rename_note requires title.",
        };
      }
      const lookupArgs: Record<string, unknown> = {
        ...args,
        title: args.from_title ?? args.note_title ?? args.note_name ?? args.title ?? args.name,
      };
      const noteId = resolveNoteId(lookupArgs, { allowActiveFallback: true });
      if (!noteId) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "Note not found. Provide note_id or existing note title.",
        };
      }
      notesState.renameNote(noteId, nextTitle);
      notesState.setActiveNote(noteId);
      const renamed = useWorkstationNotesStore.getState().notes[noteId];
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          note_id: noteId,
          title: renamed?.title ?? nextTitle,
        },
      };
    }

    if (actionId === "delete_note") {
      const confirmationResult = requireConfirmation(
        request,
        panelId,
        actionId,
        "workstation-notes.delete_note",
      );
      if (confirmationResult) return confirmationResult;
      const noteId = resolveNoteId(args, { allowActiveFallback: true });
      if (!noteId) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "Note not found. Provide note_id or note title.",
        };
      }
      const previous = useWorkstationNotesStore.getState().notes[noteId];
      notesState.deleteNote(noteId);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          deleted_note_id: noteId,
          deleted_title: previous?.title ?? null,
          active_note_id: useWorkstationNotesStore.getState().active_note_id ?? null,
        },
      };
    }

    if (actionId === "list_notes") {
      const snapshot = useWorkstationNotesStore.getState();
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          active_note_id: snapshot.active_note_id ?? null,
          count: snapshot.order.length,
          notes: snapshot.order
            .map((id) => snapshot.notes[id])
            .filter(Boolean)
            .map((note) => ({
              note_id: note.id,
              title: note.title,
              topic: note.topic,
              updated_at: note.updated_at,
            })),
        },
      };
    }
  }

  const situationSourceActionIds = new Set([
    "attach_display_audio_source",
    "attach_mic_audio_source",
    "save_room_as_note",
    "attach_room_to_helix_ask",
    "stop_room",
  ]);

  if (panelId === "situation-room-sources" || (panelId === "situation-room-pipelines" && situationSourceActionIds.has(actionId))) {
    const args = asRecord(request.args) ?? {};
    const situationState = useSituationRoomStore.getState();
    const unifiedPanelId = "situation-room-pipelines";

    if (actionId === "attach_display_audio_source") {
      const room = resolveSituationRoom(args, { createIfMissing: true });
      if (!room) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "No situation room is available for the display audio source.",
        };
      }
      context.openPanel(unifiedPanelId, undefined);
      context.focusPanel(unifiedPanelId, undefined);
      const label = asNonEmptyString(args.label ?? args.source_label ?? args.sourceLabel) ?? undefined;
      void useSituationRoomStore.getState().attachDisplayAudioSource(room.room_id, label);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          ...summarizeSituationRoom(room),
          capture_picker_requested: true,
          label: label ?? null,
        },
        message: `Opening display picker for ${room.title}.`,
      };
    }

    if (actionId === "attach_mic_audio_source") {
      const room = resolveSituationRoom(args, { createIfMissing: true });
      if (!room) {
        return {
          ok: false,
          panel_id: unifiedPanelId,
          action_id: actionId,
          message: "No situation room is available for the microphone source.",
        };
      }
      context.openPanel(unifiedPanelId, undefined);
      context.focusPanel(unifiedPanelId, undefined);
      const label = asNonEmptyString(args.label ?? args.source_label ?? args.sourceLabel) ?? undefined;
      void useSituationRoomStore.getState().attachMicAudioSource(room.room_id, label);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          ...summarizeSituationRoom(room),
          mic_permission_requested: true,
          label: label ?? null,
          capture_source: "mic",
        },
        message: `Requesting microphone permission for ${room.title}.`,
      };
    }

    if (actionId === "save_room_as_note") {
      const room = resolveSituationRoom(args);
      if (!room) {
        return {
          ok: false,
          panel_id: unifiedPanelId,
          action_id: actionId,
          message: "No situation room is available to save.",
        };
      }
      const note = situationState.saveRoomAsNote(room.room_id);
      context.openPanel("workstation-notes", undefined);
      context.focusPanel("workstation-notes", undefined);
      return {
        ok: Boolean(note),
        panel_id: unifiedPanelId,
        action_id: actionId,
        artifact: {
          ...summarizeSituationRoom(useSituationRoomStore.getState().rooms[room.room_id] ?? room),
          note_id: note?.id ?? null,
          note_title: note?.title ?? null,
        },
        message: note ? `Saved situation room "${room.title}" as a note.` : "Situation room save failed.",
      };
    }

    if (actionId === "attach_room_to_helix_ask") {
      const room = resolveSituationRoom(args);
      if (!room) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "No situation room is available to attach.",
        };
      }
      const sourceId = asNonEmptyString(args.source_id ?? args.sourceId);
      situationState.attachRoomToHelixAsk(room.room_id, sourceId ?? undefined);
      return {
        ok: true,
        panel_id: unifiedPanelId,
        action_id: actionId,
        artifact: {
          ...summarizeSituationRoom(room),
          attached_source_id: sourceId ?? null,
        },
        message: `Attached situation room "${room.title}" to Helix Ask.`,
      };
    }

    if (actionId === "stop_room") {
      const room = resolveSituationRoom(args);
      if (!room) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "No situation room is available to stop.",
        };
      }
      situationState.stopRoom(room.room_id);
      return {
        ok: true,
        panel_id: unifiedPanelId,
        action_id: actionId,
        artifact: summarizeSituationRoom(useSituationRoomStore.getState().rooms[room.room_id] ?? room),
        message: `Stopped active sources for "${room.title}".`,
      };
    }
  }

  if (panelId === "situation-room-pipelines") {
    const args = asRecord(request.args) ?? {};
    const jobState = useSituationRoomJobStore.getState();

    if (actionId === "setup_from_prompt") {
      const setupArgs = normalizeSituationRoomSetupActionArgs(args);
      const receipt = setupSituationRoomFromPrompt(setupArgs);
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      if (receipt.setup_status === "needs_capture_permission") {
        context.openPanel("situation-room-pipelines", undefined);
        context.focusPanel("situation-room-pipelines", undefined);
      }
      return {
        ok: receipt.ok,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "situation_room_setup_execution_receipt",
          ...receipt,
        } as unknown as Record<string, unknown>,
        message: receipt.message,
      };
    }

    if (actionId === "create_job") {
      const room = resolveSituationRoom(args);
      const kind = normalizeSituationJobKind(args.kind ?? args.job_kind ?? args.jobKind ?? args.type);
      if (!room || !kind) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: !room
            ? "No situation room is available for a source job."
            : "situation-room-pipelines.create_job requires kind.",
          artifact: {
            missing: [!room ? "room_id" : "", !kind ? "kind" : ""].filter(Boolean),
          },
        };
      }
      const sourceIds = resolveSituationSourceIds(room, args);
      const attachmentPolicy = asNonEmptyString(args.attachment_policy ?? args.attachmentPolicy) ?? "manual_only";
      const contextInjection =
        asNonEmptyString(args.context_injection ?? args.contextInjection) ?? "explicit_attachment_only";
      const job = jobState.createJob({
        room_id: room.room_id,
        kind,
        source_ids: sourceIds,
        title: asNonEmptyString(args.title ?? args.job_title ?? args.jobTitle) ?? undefined,
        target_language: asNonEmptyString(args.target_language ?? args.targetLanguage ?? args.language) ?? undefined,
        native_language: asNonEmptyString(args.native_language ?? args.nativeLanguage) ?? undefined,
        input_text_policy: normalizeSituationInputTextPolicy(args.input_text_policy ?? args.inputTextPolicy),
        output_render_policy: normalizeSituationOutputRenderPolicy(args.output_render_policy ?? args.outputRenderPolicy),
      });
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          job_id: job.job_id,
          room_id: job.room_id,
          kind: job.kind,
          source_ids: job.source_ids,
          target_language: job.target_language ?? null,
          native_language: job.native_language ?? null,
          input_text_policy: job.input_text_policy,
          output_render_policy: job.output_render_policy,
          attachment_policy: attachmentPolicy,
          context_injection: contextInjection,
          derived_outputs_auto_attach: false,
          command_lane_enabled: false,
        },
        message: `Created ${job.kind} job for "${room.title}".`,
      };
    }

    if (actionId === "run_job") {
      const jobId = asNonEmptyString(args.job_id ?? args.jobId);
      if (!jobId) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "situation-room-pipelines.run_job requires job_id.",
        };
      }
      const outputs = jobState.processJobNow(jobId);
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: Boolean(jobState.jobs[jobId]),
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          job_id: jobId,
          output_count: outputs.length,
          output_ids: outputs.map((output) => output.output_id),
        },
        message: jobState.jobs[jobId] ? `Processed job ${jobId}.` : `Unknown situation room job: ${jobId}`,
      };
    }

    if (actionId === "attach_job_to_helix_ask") {
      const jobId = asNonEmptyString(args.job_id ?? args.jobId);
      if (!jobId) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "situation-room-pipelines.attach_job_to_helix_ask requires job_id.",
        };
      }
      jobState.attachJobToHelixAsk(jobId);
      return {
        ok: Boolean(useSituationRoomJobStore.getState().jobs[jobId]),
        panel_id: panelId,
        action_id: actionId,
        artifact: { job_id: jobId },
        message: `Attached job ${jobId} to Helix Ask.`,
      };
    }

    if (actionId === "save_job_as_note") {
      const jobId = asNonEmptyString(args.job_id ?? args.jobId);
      if (!jobId) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "situation-room-pipelines.save_job_as_note requires job_id.",
        };
      }
      const note = jobState.saveJobAsNote(jobId);
      context.openPanel("workstation-notes", undefined);
      context.focusPanel("workstation-notes", undefined);
      return {
        ok: Boolean(note),
        panel_id: panelId,
        action_id: actionId,
        artifact: { job_id: jobId, note_id: note?.id ?? null, note_title: note?.title ?? null },
        message: note ? `Saved job ${jobId} as a note.` : `No output available to save for job ${jobId}.`,
      };
    }

    if (actionId === "stop_job") {
      const jobId = asNonEmptyString(args.job_id ?? args.jobId);
      if (!jobId) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "situation-room-pipelines.stop_job requires job_id.",
        };
      }
      jobState.stopJob(jobId);
      return {
        ok: Boolean(useSituationRoomJobStore.getState().jobs[jobId]),
        panel_id: panelId,
        action_id: actionId,
        artifact: { job_id: jobId, status: useSituationRoomJobStore.getState().jobs[jobId]?.status ?? null },
        message: `Stopped job ${jobId}.`,
      };
    }

    const graphState = useSituationRoomGraphStore.getState();

    if (actionId === "create_graph_from_recipe") {
      const recipeId = asNonEmptyString(args.recipe_id ?? args.recipeId);
      const bindings = asRecord(args.bindings) ?? {};
      if (!recipeId) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "situation-room-pipelines.create_graph_from_recipe requires recipe_id.",
          artifact: { missing: ["recipe_id"] },
        };
      }
      const room = resolveSituationRoom({ ...args, ...bindings });
      const sourceIds =
        asStringArray(args.source_ids ?? args.sourceIds).length > 0
          ? asStringArray(args.source_ids ?? args.sourceIds)
          : asStringArray(bindings.source_ids ?? bindings.sourceIds);
      const receipt = graphState.createGraphFromRecipe({
        recipe_id: recipeId,
        room_id: asNonEmptyString(args.room_id ?? args.roomId) ?? room?.room_id ?? undefined,
        source_ids: sourceIds.length > 0 ? sourceIds : undefined,
        bindings,
        title: asNonEmptyString(args.title ?? args.graph_title ?? args.graphTitle) ?? undefined,
      });
      if (receipt.ok) {
        context.openPanel(panelId, undefined);
        context.focusPanel(panelId, undefined);
      }
      return {
        ok: receipt.ok,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "situation_room_graph_execution_receipt",
          ...receipt,
        },
        message: receipt.ok
          ? `Created ${receipt.recipe_id ?? recipeId} graph ${receipt.graph_id}.`
          : `Could not create ${recipeId}: missing ${receipt.missing_bindings.join(", ") || "recipe"}.`,
      };
    }

    if (actionId === "create_graph") {
      const room = resolveSituationRoom(args);
      if (!room) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "No situation room is available for a graph.",
          artifact: { missing: ["room_id"] },
        };
      }
      const graph = graphState.createGraph({
        room_id: room.room_id,
        title: asNonEmptyString(args.title ?? args.graph_title ?? args.graphTitle) ?? `${room.title} graph`,
      });
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          graph_id: graph.graph_id,
          room_id: graph.room_id,
          title: graph.title,
          node_count: graph.nodes.length,
          edge_count: graph.edges.length,
          attachment_policy: "manual_only",
          context_injection: "explicit_attachment_only",
        },
        message: `Created graph "${graph.title}" for "${room.title}".`,
      };
    }

    if (actionId === "add_node") {
      const graphId = asNonEmptyString(args.graph_id ?? args.graphId);
      const type = normalizeSituationGraphNodeType(args.type ?? args.node_type ?? args.nodeType);
      const title = asNonEmptyString(args.title ?? args.label);
      if (!graphId || !type || !title) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "situation-room-pipelines.add_node requires graph_id, type, and title.",
          artifact: {
            missing: [!graphId ? "graph_id" : "", !type ? "type" : "", !title ? "title" : ""].filter(Boolean),
          },
        };
      }
      const node = graphState.addNode({
        graph_id: graphId,
        type,
        title,
        column: normalizeSituationGraphColumn(args.column),
        status: normalizeSituationGraphStatus(args.status),
        source_id: asNonEmptyString(args.source_id ?? args.sourceId) ?? undefined,
        speaker_id: asNonEmptyString(args.speaker_id ?? args.speakerId) ?? undefined,
        job_id: asNonEmptyString(args.job_id ?? args.jobId) ?? undefined,
      });
      return {
        ok: Boolean(node),
        panel_id: panelId,
        action_id: actionId,
        artifact: { graph_id: graphId, node_id: node?.node_id ?? null },
        message: node ? `Added ${type} node to graph ${graphId}.` : `Unknown situation room graph: ${graphId}`,
      };
    }

    if (actionId === "connect_nodes") {
      const graphId = asNonEmptyString(args.graph_id ?? args.graphId);
      const fromNodeId = asNonEmptyString(args.from_node_id ?? args.fromNodeId);
      const toNodeId = asNonEmptyString(args.to_node_id ?? args.toNodeId);
      const lane = normalizeSituationGraphLane(args.lane);
      if (!graphId || !fromNodeId || !toNodeId || !lane) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "situation-room-pipelines.connect_nodes requires graph_id, from_node_id, to_node_id, and lane.",
          artifact: {
            missing: [
              !graphId ? "graph_id" : "",
              !fromNodeId ? "from_node_id" : "",
              !toNodeId ? "to_node_id" : "",
              !lane ? "lane" : "",
            ].filter(Boolean),
          },
        };
      }
      const edge = graphState.connectNodes({
        graph_id: graphId,
        from_node_id: fromNodeId,
        from_port: asNonEmptyString(args.from_port ?? args.fromPort) ?? undefined,
        to_node_id: toNodeId,
        to_port: asNonEmptyString(args.to_port ?? args.toPort) ?? undefined,
        lane,
      });
      return {
        ok: Boolean(edge),
        panel_id: panelId,
        action_id: actionId,
        artifact: { graph_id: graphId, edge_id: edge?.edge_id ?? null },
        message: edge ? `Connected graph lane ${lane}.` : `Could not connect nodes in graph ${graphId}.`,
      };
    }

    if (actionId === "create_translation_pair") {
      const room = resolveSituationRoom(args);
      const speakerAId = asNonEmptyString(args.speaker_a_id ?? args.speakerAId);
      const speakerBId = asNonEmptyString(args.speaker_b_id ?? args.speakerBId);
      const speakerALanguage = asNonEmptyString(args.speaker_a_native_language ?? args.speakerANativeLanguage);
      const speakerBLanguage = asNonEmptyString(args.speaker_b_native_language ?? args.speakerBNativeLanguage);
      if (!room || !speakerAId || !speakerBId || !speakerALanguage || !speakerBLanguage) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message:
            "situation-room-pipelines.create_translation_pair requires a room and two speaker ids/native languages.",
          artifact: {
            missing: [
              !room ? "room_id" : "",
              !speakerAId ? "speaker_a_id" : "",
              !speakerBId ? "speaker_b_id" : "",
              !speakerALanguage ? "speaker_a_native_language" : "",
              !speakerBLanguage ? "speaker_b_native_language" : "",
            ].filter(Boolean),
          },
        };
      }
      const renderPolicy =
        normalizeSituationOutputRenderPolicy(args.render_policy ?? args.renderPolicy) ?? "dual";
      const rawVoiceOutput = asNonEmptyString(args.voice_output ?? args.voiceOutput);
      const voiceOutput: TranslationPairNodeConfig["voice_output"] =
        rawVoiceOutput === "on_confirm" || rawVoiceOutput === "auto_when_direct_addressed"
          ? rawVoiceOutput
          : "off";
      const result = graphState.createTranslationPair({
        graph_id: asNonEmptyString(args.graph_id ?? args.graphId) ?? undefined,
        room_id: room.room_id,
        speaker_a_id: speakerAId,
        speaker_b_id: speakerBId,
        speaker_a_native_language: speakerALanguage,
        speaker_b_native_language: speakerBLanguage,
        source_ids: resolveSituationSourceIds(room, args),
        render_policy: renderPolicy,
        voice_output: voiceOutput,
        title: asNonEmptyString(args.title ?? args.label) ?? undefined,
      });
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: Boolean(result),
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          graph_id: result?.graph.graph_id ?? null,
          node_id: result?.node.node_id ?? null,
          job_ids: result?.job_ids ?? [],
          attachment_policy: "manual_only",
          context_injection: "explicit_attachment_only",
          command_lane_enabled: false,
        },
        message: result
          ? `Created two-way translation graph for ${speakerAId} and ${speakerBId}.`
          : "Could not create translation pair.",
      };
    }

    if (actionId === "attach_graph_to_helix_ask") {
      const graphId = asNonEmptyString(args.graph_id ?? args.graphId);
      if (!graphId) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "situation-room-pipelines.attach_graph_to_helix_ask requires graph_id.",
        };
      }
      graphState.attachGraphToHelixAsk(graphId);
      const graph = useSituationRoomGraphStore.getState().graphs[graphId];
      return {
        ok: Boolean(graph),
        panel_id: panelId,
        action_id: actionId,
        artifact: { graph_id: graphId, node_count: graph?.nodes.length ?? 0, edge_count: graph?.edges.length ?? 0 },
        message: graph ? `Attached graph ${graphId} to Helix Ask.` : `Unknown situation room graph: ${graphId}`,
      };
    }

    if (actionId === "attach_standby_to_helix_thread") {
      const room = resolveSituationRoom(args);
      const threadId = asNonEmptyString(args.thread_id ?? args.threadId);
      if (!room || !threadId) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          artifact: {
            kind: "situation_thread_binding_receipt",
            ok: false,
            missing: [!room ? "room_id" : "", !threadId ? "thread_id" : ""].filter(Boolean),
          },
          message: !room
            ? "No situation room is available to bind to Helix Ask."
            : "situation-room-pipelines.attach_standby_to_helix_thread requires thread_id.",
        };
      }
      const sourceIds = resolveSituationSourceIds(room, args);
      const bindingRequest = {
        room_id: room.room_id,
        source_id: asNonEmptyString(args.source_id ?? args.sourceId) ?? sourceIds[0] ?? null,
        graph_id: asNonEmptyString(args.graph_id ?? args.graphId) ?? null,
        world_id: asNonEmptyString(args.world_id ?? args.worldId) ?? "minecraft:minehut",
        thread_id: threadId,
        turn_id: asNonEmptyString(args.turn_id ?? args.turnId) ?? null,
        session_id: asNonEmptyString(args.session_id ?? args.sessionId) ?? null,
        trace_id: asNonEmptyString(args.trace_id ?? args.traceId) ?? null,
        mode: "standby_receipts",
        append_policy:
          asNonEmptyString(args.append_policy ?? args.appendPolicy) === "all_receipts_debug"
            ? "all_receipts_debug"
            : "salient_only",
      };
      postSituationThreadBinding(bindingRequest);
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "situation_thread_binding_receipt",
          ok: true,
          binding_request: bindingRequest,
          context_policy: "explicit_attachment_only",
          command_lane_enabled: false,
        },
        message: `Submitted standby receipt binding for ${room.title}.`,
      };
    }

    if (actionId === "start_situation_goal_session") {
      const room = resolveSituationRoom(args);
      const threadId = asNonEmptyString(args.thread_id ?? args.threadId) ?? "helix-ask:desktop";
      const roomId = asNonEmptyString(args.room_id ?? args.roomId) ?? room?.room_id ?? "room:minecraft-minehut";
      const sourceIdsFromRoom = room ? resolveSituationSourceIds(room, args) : [];
      const worldEventSourceMissing =
        args.world_event_source_status === "configured_missing" ||
        args.no_world_event_source === true ||
        args.source_id === null ||
        args.sourceId === null;
      const sourceId =
        worldEventSourceMissing
          ? null
          : asNonEmptyString(args.source_id ?? args.sourceId) ?? sourceIdsFromRoom[0] ?? "source:minecraft-server";
      const sourceIds = Array.from(
        new Set([
          ...asStringArray(args.source_ids ?? args.sourceIds),
          ...(sourceId ? [sourceId] : []),
        ].filter(Boolean)),
      );
      const worldId = worldEventSourceMissing ? null : asNonEmptyString(args.world_id ?? args.worldId) ?? "minecraft:minehut";
      const existingGraphId = asNonEmptyString(args.graph_id ?? args.graphId) ?? graphState.active_graph_id_by_room[roomId];
      const graphReceipt = existingGraphId
        ? null
        : graphState.createGraphFromRecipe({
            recipe_id: "minecraft_world_monitor",
            room_id: roomId,
            source_ids: sourceIds,
            bindings: {
              room_id: roomId,
              source_ids: sourceIds,
              standby_mode: "high_salience",
              world_id: worldId,
            },
            title: "Minecraft world monitor",
          });
      const graphId = existingGraphId ?? (graphReceipt?.ok ? graphReceipt.graph_id : null);
      if (graphId) {
        graphState.attachGraphToHelixAsk(graphId);
      }
      const appendPolicy =
        asNonEmptyString(args.append_policy ?? args.appendPolicy) === "episodes_and_salience"
          ? "episodes_and_salience"
          : asNonEmptyString(args.append_policy ?? args.appendPolicy) === "callouts_only"
            ? "callouts_only"
            : "salient_only";
      const standbyMode =
        asNonEmptyString(args.standby_mode ?? args.standbyMode) === "voice_on_confirm"
          ? "voice_on_confirm"
          : asNonEmptyString(args.standby_mode ?? args.standbyMode) === "critical_voice"
            ? "critical_voice"
            : asNonEmptyString(args.standby_mode ?? args.standbyMode) === "direct_address_only"
              ? "direct_address_only"
              : asNonEmptyString(args.standby_mode ?? args.standbyMode) === "off"
                ? "off"
                : "text_only";
      const bindingRequest = {
        room_id: roomId,
        source_id: sourceId,
        graph_id: graphId,
        world_id: worldId,
        thread_id: threadId,
        turn_id: asNonEmptyString(args.turn_id ?? args.turnId) ?? null,
        session_id: asNonEmptyString(args.session_id ?? args.sessionId) ?? null,
        trace_id: asNonEmptyString(args.trace_id ?? args.traceId) ?? null,
        mode: "standby_receipts",
        append_policy: "salient_only",
      };
      const sessionRequest = {
        thread_id: threadId,
        room_id: roomId,
        source_ids: sourceIds,
        graph_id: graphId,
        world_id: worldId,
        objective:
          asNonEmptyString(args.objective) ??
          "Monitor my Minecraft session and surface danger or meaningful progress.",
        standby_mode: standbyMode,
        append_policy: appendPolicy,
      };
      postSituationThreadBinding(bindingRequest);
      postSituationGoalSession(sessionRequest);
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "situation_goal_session_receipt",
          ok: true,
          session_request: sessionRequest,
          binding_request: bindingRequest,
          graph_receipt: graphReceipt,
          context_policy: "explicit_attachment_only",
          command_lane_enabled: false,
        },
        message: worldEventSourceMissing
          ? "Started a visible situation goal session without a world-event source."
          : `Started a visible situation goal session for ${worldId}.`,
      };
    }

    if (actionId === "create_live_answer_environment") {
      const room = resolveSituationRoom(args);
      const threadId = asNonEmptyString(args.thread_id ?? args.threadId) ?? "helix-ask:desktop";
      const objective =
        asNonEmptyString(args.objective) ??
        "Create a live answer environment for this source.";
      const roomId = asNonEmptyString(args.room_id ?? args.roomId) ?? room?.room_id ?? undefined;
      const worldEventSourceMissing =
        args.world_event_source_status === "configured_missing" ||
        args.no_world_event_source === true ||
        args.source_id === null ||
        args.sourceId === null;
      const sourceIds = Array.from(
        new Set([
          ...asStringArray(args.source_ids ?? args.sourceIds),
          ...(worldEventSourceMissing ? [] : asStringArray(args.source_id ?? args.sourceId)),
          ...(worldEventSourceMissing || !room ? [] : resolveSituationSourceIds(room, args)),
        ].filter(Boolean)),
      );
      const request = {
        thread_id: threadId,
        objective,
        room_id: roomId,
        source_ids: sourceIds,
        graph_id: asNonEmptyString(args.graph_id ?? args.graphId) ?? undefined,
        preset: asNonEmptyString(args.preset) ?? "custom",
        line_schema: Array.isArray(args.line_schema) ? args.line_schema : undefined,
        mode: asNonEmptyString(args.mode) ?? "text_only",
        source_config:
          args.source_config && typeof args.source_config === "object"
            ? args.source_config as Record<string, unknown>
            : undefined,
      };
      postLiveAnswerEnvironment(request);
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "live_answer_environment_receipt",
          ok: true,
          request,
          context_policy: "compact_context_pack_only",
          deterministic_content_role: "observation_not_assistant_answer",
          command_lane_enabled: false,
        },
        message: `Created a live answer environment for ${objective}.`,
      };
    }

    if (actionId === "set_live_commentary_policy") {
      const threadId = asNonEmptyString(args.thread_id ?? args.threadId) ?? "helix-ask:desktop";
      const cadence = normalizeLiveCommentaryCadence(args.cadence ?? args.commentary_cadence ?? args.commentaryCadence);
      const status = normalizeLiveCommentaryStatus(args.status, cadence);
      const voiceMode = normalizeLiveCommentaryVoiceMode(args.voice_mode ?? args.voiceMode);
      const environmentId = asNonEmptyString(args.environment_id ?? args.environmentId);
      const request = {
        thread_id: threadId,
        environment_id: environmentId ?? undefined,
        cadence,
        status,
        ...(voiceMode ? { voice_mode: voiceMode } : {}),
      };
      postLiveCommentarySessionWhenEnvironmentReady(request);
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "live_commentary_session_receipt",
          ok: true,
          request,
          pending_environment_resolution: !environmentId,
          context_policy: "compact_context_pack_only",
          raw_logs_included: false,
          deterministic_content_role: "observation_not_assistant_answer",
        },
        message: environmentId
          ? `Set live commentary cadence to ${cadence}.`
          : `Queued live commentary setup for the active ${threadId} environment.`,
      };
    }

    if (actionId === "request_agentic_review") {
      const threadId = asNonEmptyString(args.thread_id ?? args.threadId) ?? "helix-ask:desktop";
      const environmentId = asNonEmptyString(args.environment_id ?? args.environmentId);
      const question =
        asNonEmptyString(args.question) ??
        "Review the latest compact live environment state.";
      const trigger = asNonEmptyString(args.trigger) ?? "manual_button";
      const request = {
        thread_id: threadId,
        environment_id: environmentId ?? undefined,
        question,
        trigger,
      };
      postLiveAgenticReviewRequestWhenEnvironmentReady(request);
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "live_agentic_review_receipt",
          ok: true,
          request,
          pending_environment_resolution: !environmentId,
          context_policy: "compact_context_pack_only",
          raw_logs_included: false,
          deterministic_content_role: "observation_not_assistant_answer",
        },
        message: environmentId
          ? "Requested an agentic review for the live environment."
          : `Queued an agentic review request for the active ${threadId} environment.`,
      };
    }

    if (actionId === "set_companion_policy") {
      const threadId = asNonEmptyString(args.thread_id ?? args.threadId) ?? "helix-ask:desktop";
      const companionMode = asNonEmptyString(args.companion_mode ?? args.companionMode) ?? "active_companion";
      const commentaryMode = asNonEmptyString(args.commentary_mode ?? args.commentaryMode) ?? "anomalies_and_milestones";
      const request = {
        thread_id: threadId,
        voice_input_active: asBoolean(args.voice_input_active ?? args.voiceInputActive) ?? true,
        voice_output_enabled: asBoolean(args.voice_output_enabled ?? args.voiceOutputEnabled) ?? false,
        companion_mode: companionMode,
        commentary_mode: commentaryMode,
        direct_address_names: asStringArray(args.direct_address_names ?? args.directAddressNames).length
          ? asStringArray(args.direct_address_names ?? args.directAddressNames)
          : ["helix", "dottie"],
      };
      postCompanionPolicy(request);
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "companion_policy_receipt",
          ok: true,
          request,
          context_policy: "compact_context_pack_only",
          raw_audio_included: false,
          raw_transcript_included: false,
          deterministic_content_role: "observation_not_assistant_answer",
        },
        message: `Set companion mode to ${companionMode}.`,
      };
    }

    if (actionId === "construct.list_recipes") {
      const recipeId = resolveSituationConstructRecipeId(args.recipe_id ?? args.recipeId);
      const recipes = recipeId
        ? SITUATION_CONSTRUCT_RECIPE_CATALOG.filter((recipe) => recipe.recipe_id === recipeId)
        : SITUATION_CONSTRUCT_RECIPE_CATALOG;
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "situation_construct_recipe_registry",
          schema: "helix.situation_construct_recipe_registry.v1",
          recipes,
          count: recipes.length,
          assistant_answer: false,
          raw_content_included: false,
          instruction_authority: "none",
          context_role: "tool_evidence",
          ask_context_policy: "evidence_only",
          terminal_eligible: false,
          panel_generated_answer: false,
          next_step_authority: "agent_step_decision",
        },
        message: `Found ${recipes.length} Situation Room construct recipe${recipes.length === 1 ? "" : "s"}.`,
      };
    }

    if (actionId === "construct.create_from_recipe") {
      const recipeId = resolveSituationConstructRecipeId(args.recipe_id ?? args.recipeId);
      if (!recipeId) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "situation-room-pipelines.construct.create_from_recipe requires a known recipe_id.",
        };
      }
      const artifact = buildConstructRecipeRunArtifact({ ...args, recipe_id: recipeId });
      if (!artifact) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "Unable to create Situation Room construct recipe run.",
        };
      }
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: artifact.recipeRun,
        message: `Created Situation Room construct recipe ${recipeId}.`,
      };
    }

    if (actionId === "construct.query") {
      const threadId = asNonEmptyString(args.thread_id ?? args.threadId);
      const roomId = asNonEmptyString(args.room_id ?? args.roomId);
      const constructId = asNonEmptyString(args.construct_id ?? args.constructId);
      const recipeId = resolveSituationConstructRecipeId(args.recipe_id ?? args.recipeId);
      const type = asNonEmptyString(args.type);
      const status = resolveSituationConstructStatus(args.status);
      const constructs = Array.from(situationConstructs.values()).filter((construct) => {
        if (constructId && construct.construct_id !== constructId) return false;
        if (threadId && construct.thread_id !== threadId) return false;
        if (roomId && construct.room_id !== roomId) return false;
        if (type && construct.type !== type) return false;
        if (status && construct.status !== status) return false;
        return true;
      });
      const recipeRuns = Array.from(situationConstructRecipeRuns.values()).filter((run) => {
        if (threadId && run.thread_id !== threadId) return false;
        if (roomId && run.room_id !== roomId) return false;
        if (recipeId && run.recipe_id !== recipeId) return false;
        return true;
      });
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "situation_construct_query_result",
          schema: "helix.situation_construct_query_result.v1",
          constructs,
          recipe_runs: recipeRuns,
          count: constructs.length,
          assistant_answer: false,
          raw_content_included: false,
          instruction_authority: "none",
          context_role: "tool_evidence",
          ask_context_policy: "evidence_only",
          terminal_eligible: false,
          panel_generated_answer: false,
          next_step_authority: "agent_step_decision",
          construct_observation: buildPanelConstructObservation({
            action: "construct.query",
            runId: `construct_query:${Date.now()}`,
            constructs,
            missingInputs: [],
          }),
        },
        message: `Found ${constructs.length} construct${constructs.length === 1 ? "" : "s"}.`,
      };
    }

    if (actionId === "construct.explain") {
      const constructId = asNonEmptyString(args.construct_id ?? args.constructId);
      const construct = constructId ? situationConstructs.get(constructId) : null;
      if (!constructId || !construct) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "situation-room-pipelines.construct.explain requires an existing construct_id.",
        };
      }
      const childConstructs = construct.child_construct_ids
        .map((childId) => situationConstructs.get(childId))
        .filter((entry): entry is HelixSituationConstruct => Boolean(entry));
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "situation_construct_explanation",
          schema: "helix.situation_construct_explanation.v1",
          construct,
          child_constructs: childConstructs,
          summary: `${construct.name} is a ${construct.type} construct with ${construct.output_bindings.length} output binding${construct.output_bindings.length === 1 ? "" : "s"}.`,
          assistant_answer: false,
          raw_content_included: false,
          instruction_authority: "none",
          context_role: "tool_evidence",
          ask_context_policy: "evidence_only",
          terminal_eligible: false,
          panel_generated_answer: false,
          next_step_authority: "agent_step_decision",
          construct_observation: buildPanelConstructObservation({
            action: "construct.query",
            runId: `construct_explain:${Date.now()}`,
            constructs: [construct, ...childConstructs],
            missingInputs: [],
          }),
        },
        message: `Explained construct ${constructId}.`,
      };
    }

    if (actionId === "construct.set_operating_prompt") {
      const contractId = asNonEmptyString(args.contract_id ?? args.contractId);
      const operatingPrompt = asNonEmptyString(args.operating_prompt ?? args.operatingPrompt);
      if (!contractId || !operatingPrompt) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "situation-room-pipelines.construct.set_operating_prompt requires contract_id and operating_prompt.",
        };
      }
      let updatedRun: (HelixSituationConstructRecipeRun & Record<string, unknown>) | null = null;
      for (const run of situationConstructRecipeRuns.values()) {
        const contract = asRecord(run.live_job_contract) as (SituationRoomLiveJobContract & Record<string, unknown>) | null;
        if (contract?.contract_id !== contractId) continue;
        const now = new Date().toISOString();
        const updatedContract: SituationRoomLiveJobContract = {
          ...contract,
          operating_prompt: operatingPrompt,
          operating_prompt_history: [
            ...contract.operating_prompt_history,
            {
              prompt: operatingPrompt,
              changed_at: now,
              changed_by: "user",
              reason: asNonEmptyString(args.reason) ?? "operator_updated_operating_prompt",
            },
          ],
          compiled_policy: {
            ...contract.compiled_policy,
            evidence_threshold: /confirmed|only\s+if/i.test(operatingPrompt) ? "confirmed" : contract.compiled_policy.evidence_threshold,
          },
        };
        const constructs = run.created_construct_ids
          .map((constructId) => situationConstructs.get(constructId))
          .filter((construct): construct is HelixSituationConstruct => Boolean(construct));
        const constructObservation = buildPanelConstructObservation({
          action: "construct.set_operating_prompt",
          runId: `construct_set_prompt:${Date.now()}`,
          constructs,
          contract: updatedContract,
          missingInputs: [],
        });
        updatedRun = {
          ...run,
          live_job_contract: updatedContract,
          construct_observation: constructObservation,
        };
        situationConstructRecipeRuns.set(run.run_id, updatedRun);
        break;
      }
      if (!updatedRun) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: `No live job contract found for ${contractId}.`,
        };
      }
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "situation_live_job_prompt_update_receipt",
          schema: "helix.situation_live_job_prompt_update_receipt.v1",
          recipe_run: updatedRun,
          live_job_contract: updatedRun.live_job_contract,
          construct_observation: updatedRun.construct_observation,
          assistant_answer: false,
          raw_content_included: false,
          instruction_authority: "none",
          context_role: "tool_evidence",
          ask_context_policy: "evidence_only",
          terminal_eligible: false,
          panel_generated_answer: false,
          next_step_authority: "agent_step_decision",
        },
        message: "Updated live job operating prompt as an observation-only receipt.",
      };
    }

    if (actionId === "construct.detach" || actionId === "construct.activate") {
      const constructId = asNonEmptyString(args.construct_id ?? args.constructId);
      const nextStatus: HelixSituationConstructStatus = actionId === "construct.detach" ? "detached" : "active";
      const updated = constructId
        ? updatePanelSituationConstruct(constructId, (construct) => ({ ...construct, status: nextStatus }))
        : null;
      if (!constructId || !updated) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: `situation-room-pipelines.${actionId} requires an existing construct_id.`,
        };
      }
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "situation_construct_update_receipt",
          schema: "helix.situation_construct_update_receipt.v1",
          construct: updated,
          assistant_answer: false,
          raw_content_included: false,
          instruction_authority: "none",
          context_role: "tool_evidence",
          ask_context_policy: "evidence_only",
          terminal_eligible: false,
          panel_generated_answer: false,
          next_step_authority: "agent_step_decision",
          construct_observation: buildPanelConstructObservation({
            action: actionId === "construct.detach" ? "construct.detach" : "construct.activate",
            runId: `construct_update:${Date.now()}`,
            constructs: [updated],
            missingInputs: [],
          }),
        },
        message: `Marked construct ${constructId} ${nextStatus}.`,
      };
    }

    if (actionId === "construct.attach_source") {
      const constructId = asNonEmptyString(args.construct_id ?? args.constructId);
      const sourceIds = asStringArray(args.source_ids ?? args.sourceIds);
      const updated = constructId
        ? updatePanelSituationConstruct(constructId, (construct) => ({
            ...construct,
            source_ids: Array.from(new Set([...construct.source_ids, ...sourceIds])),
          }))
        : null;
      if (!constructId || !updated || sourceIds.length === 0) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "situation-room-pipelines.construct.attach_source requires construct_id and source_ids.",
        };
      }
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "situation_construct_update_receipt",
          schema: "helix.situation_construct_update_receipt.v1",
          construct: updated,
          attached_source_ids: sourceIds,
          assistant_answer: false,
          raw_content_included: false,
          instruction_authority: "none",
          context_role: "tool_evidence",
          ask_context_policy: "evidence_only",
          terminal_eligible: false,
          panel_generated_answer: false,
          next_step_authority: "agent_step_decision",
          construct_observation: buildPanelConstructObservation({
            action: "construct.attach_source",
            runId: `construct_attach_source:${Date.now()}`,
            constructs: [updated],
            missingInputs: [],
          }),
        },
        message: `Attached ${sourceIds.length} source${sourceIds.length === 1 ? "" : "s"} to construct ${constructId}.`,
      };
    }

    if (actionId === "construct.bind_output") {
      const constructId = asNonEmptyString(args.construct_id ?? args.constructId);
      const outputKind = resolveSituationConstructOutput(args.output);
      const artifactRef = asNonEmptyString(args.artifact_ref ?? args.artifactRef ?? args.environment_id ?? args.environmentId);
      const requestedStatus = resolveSituationConstructStatus(args.status);
      const bindingStatus: HelixSituationConstructOutputBinding["status"] =
        requestedStatus === "active" || requestedStatus === "blocked" || requestedStatus === "detached"
          ? requestedStatus
          : outputKind === "live_answer_environment" && artifactRef
            ? "active"
            : "planned";
      const updated =
        constructId && outputKind
          ? updatePanelSituationConstruct(constructId, (construct) => ({
              ...construct,
              output_bindings: [
                ...construct.output_bindings,
                {
                  output_kind: outputKind,
                  artifact_ref: artifactRef ?? null,
                  status: bindingStatus,
                },
              ],
            }))
          : null;
      if (!constructId || !outputKind || !updated) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "situation-room-pipelines.construct.bind_output requires construct_id and output.",
        };
      }
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "situation_construct_update_receipt",
          schema: "helix.situation_construct_update_receipt.v1",
          construct: updated,
          output_kind: outputKind,
          assistant_answer: false,
          raw_content_included: false,
          instruction_authority: "none",
          context_role: "tool_evidence",
          ask_context_policy: "evidence_only",
          terminal_eligible: false,
          panel_generated_answer: false,
          next_step_authority: "agent_step_decision",
          construct_observation: buildPanelConstructObservation({
            action: "construct.bind_output",
            runId: `construct_bind_output:${Date.now()}`,
            constructs: [updated],
            missingInputs: [],
          }),
        },
        message: `Bound ${outputKind} output to construct ${constructId}.`,
      };
    }

    if (actionId === "dottie.manifest") {
      const artifact = buildConstructRecipeRunArtifact({ ...args, recipe_id: "auntie_dottie_witness" });
      const receipt = artifact?.compatibilityReceipt;
      if (!artifact || !receipt) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "Unable to manifest Auntie Dottie as a Situation Room construct recipe.",
        };
      }
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          ...receipt,
          recipe_run: artifact.recipeRun,
          live_job_contract: artifact.recipeRun.live_job_contract,
          construct_observation: artifact.recipeRun.construct_observation,
          terminal_eligible: false,
          panel_generated_answer: false,
          next_step_authority: "agent_step_decision",
        },
        message: "Manifested Auntie Dottie as a witness-only Situation Room preset.",
      };
    }

    if (actionId === "observer.attach") {
      const targetRunId = asNonEmptyString(args.target_run_id ?? args.targetRunId);
      const observerProfile = asNonEmptyString(args.observer_profile ?? args.observerProfile);
      if (!targetRunId || !observerProfile) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "situation-room-pipelines.observer.attach requires target_run_id and observer_profile.",
        };
      }
      const observerId = nextDottieObserverId(observerProfile, targetRunId);
      const subscription: HelixDottieObserverSubscriptionV1 = {
        schema: HELIX_DOTTIE_OBSERVER_SUBSCRIPTION_SCHEMA,
        observer_id: observerId,
        observer_profile: observerProfile,
        target_run_id: targetRunId,
        target_agent_id: asNonEmptyString(args.target_agent_id ?? args.targetAgentId) ?? "agent:helix_ask",
        target_turn_id: asNonEmptyString(args.target_turn_id ?? args.targetTurnId),
        thread_id: asNonEmptyString(args.thread_id ?? args.threadId),
        voice_mode: asNonEmptyString(args.voice_mode ?? args.voiceMode) ?? "voice_on_confirm",
        max_chars: boundedDottieMaxChars(args.max_chars ?? args.maxChars),
        event_filter: asStringArray(args.event_filter ?? args.eventFilter).length
          ? asStringArray(args.event_filter ?? args.eventFilter)
          : [HELIX_AGENT_COMMENTARY_SCHEMA],
        status: "active",
        authority: "witness_only",
        can_execute_tools: false,
        assistant_answer: false,
        raw_reasoning_included: false,
      };
      dottieObserverSubscriptions.set(observerId, subscription);
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "dottie_observer_subscription_receipt",
          ok: true,
          subscription,
          context_policy: "compact_context_pack_only",
          deterministic_content_role: "observation_not_assistant_answer",
          raw_logs_included: false,
          raw_transcript_included: false,
          raw_reasoning_included: false,
          assistant_answer: false,
          raw_content_included: false,
          terminal_eligible: false,
          panel_generated_answer: false,
          next_step_authority: "agent_step_decision",
        },
        message: `Attached ${observerProfile} as a witness-only observer.`,
      };
    }

    if (actionId === "observer.detach") {
      const observerId = asNonEmptyString(args.observer_id ?? args.observerId);
      if (!observerId) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "situation-room-pipelines.observer.detach requires observer_id.",
        };
      }
      const existing = dottieObserverSubscriptions.get(observerId);
      const subscription: HelixDottieObserverSubscriptionV1 = existing
        ? { ...existing, status: "detached" }
        : {
            schema: HELIX_DOTTIE_OBSERVER_SUBSCRIPTION_SCHEMA,
            observer_id: observerId,
            observer_profile: asNonEmptyString(args.observer_profile ?? args.observerProfile) ?? "auntie_dottie",
            target_run_id: asNonEmptyString(args.target_run_id ?? args.targetRunId) ?? "unknown",
            target_agent_id: "agent:helix_ask",
            target_turn_id: null,
            thread_id: asNonEmptyString(args.thread_id ?? args.threadId),
            voice_mode: "voice_on_confirm",
            max_chars: 220,
            event_filter: [HELIX_AGENT_COMMENTARY_SCHEMA],
            status: "detached",
            authority: "witness_only",
            can_execute_tools: false,
            assistant_answer: false,
            raw_reasoning_included: false,
          };
      dottieObserverSubscriptions.set(observerId, subscription);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "dottie_observer_subscription_receipt",
          ok: true,
          subscription,
          deterministic_content_role: "observation_not_assistant_answer",
          raw_reasoning_included: false,
          assistant_answer: false,
          raw_content_included: false,
          terminal_eligible: false,
          panel_generated_answer: false,
          next_step_authority: "agent_step_decision",
        },
        message: `Detached observer ${observerId}.`,
      };
    }

    if (actionId === "observer.query") {
      const threadId = asNonEmptyString(args.thread_id ?? args.threadId);
      const targetRunId = asNonEmptyString(args.target_run_id ?? args.targetRunId);
      const observerProfile = asNonEmptyString(args.observer_profile ?? args.observerProfile);
      const subscriptions = Array.from(dottieObserverSubscriptions.values()).filter((subscription) => {
        if (threadId && subscription.thread_id !== threadId) return false;
        if (targetRunId && subscription.target_run_id !== targetRunId) return false;
        if (observerProfile && subscription.observer_profile !== observerProfile) return false;
        return true;
      });
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "dottie_observer_query_receipt",
          ok: true,
          subscriptions,
          count: subscriptions.length,
          deterministic_content_role: "observation_not_assistant_answer",
          raw_reasoning_included: false,
          assistant_answer: false,
          raw_content_included: false,
          terminal_eligible: false,
          panel_generated_answer: false,
          next_step_authority: "agent_step_decision",
        },
        message: `Found ${subscriptions.length} observer subscription${subscriptions.length === 1 ? "" : "s"}.`,
      };
    }

    if (actionId === "voice_delivery.propose_from_trace") {
      const sourceEventId = asNonEmptyString(args.source_event_id ?? args.sourceEventId);
      if (!sourceEventId) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "situation-room-pipelines.voice_delivery.propose_from_trace requires source_event_id.",
        };
      }
      const sourceText = asNonEmptyString(args.source_text ?? args.sourceText);
      const observerId = asNonEmptyString(args.observer_id ?? args.observerId) ?? "observer:dottie:unassigned";
        if (!sourceText) {
          const suppressedReceipt = {
            kind: "dottie_voice_receipt",
            schema: HELIX_DOTTIE_VOICE_RECEIPT_SCHEMA,
          observer_id: observerId,
          source_event_id: sourceEventId,
          source_event_schema: asNonEmptyString(args.source_event_schema ?? args.sourceEventSchema) ?? HELIX_AGENT_COMMENTARY_SCHEMA,
            spoken: false,
            speak_authority: null,
            assistant_answer: false,
            authority: "witness_only",
            suppression_reason: "missing_source_text",
          deterministic_content_role: "observation_not_assistant_answer",
          raw_reasoning_included: false,
        };
        recordDottieVoiceDebugClip({
          receipt: suppressedReceipt,
          voiceMode: asNonEmptyString(args.voice_mode ?? args.voiceMode),
          status: "suppressed",
          suppressionReason: "missing_source_text",
        });
        return {
          ok: true,
          panel_id: panelId,
          action_id: actionId,
          artifact: {
            ...suppressedReceipt,
            construct_observation: buildPanelConstructObservation({
              action: "voice_delivery.propose_from_trace",
              runId: `voice_proposal:${Date.now()}`,
              constructs: [],
              voicePolicy: "propose_only",
              spoken: false,
              confirmSpeakReceiptPresent: false,
            }),
            terminal_eligible: false,
            panel_generated_answer: false,
            next_step_authority: "agent_step_decision",
          },
          message: "Dottie voice proposal suppressed because no public source text was provided.",
        };
      }
      const receipt = buildDottieVoiceReceipt({
        observer_id: observerId,
        target_agent_id: asNonEmptyString(args.target_agent_id ?? args.targetAgentId),
        target_turn_id: asNonEmptyString(args.target_turn_id ?? args.targetTurnId),
        source_event_id: sourceEventId,
        source_event_schema: asNonEmptyString(args.source_event_schema ?? args.sourceEventSchema),
        source_text: sourceText,
        max_chars: boundedDottieMaxChars(args.max_chars ?? args.maxChars),
        spoken: false,
      });
      recordDottieVoiceDebugClip({
        receipt,
        voiceMode: asNonEmptyString(args.voice_mode ?? args.voiceMode),
        status: "proposed",
      });
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "dottie_voice_receipt",
          ok: true,
          proposed: true,
          ...receipt,
          deterministic_content_role: "observation_not_assistant_answer",
          construct_observation: buildPanelConstructObservation({
            action: "voice_delivery.propose_from_trace",
            runId: `voice_proposal:${Date.now()}`,
            constructs: [],
            voicePolicy: "propose_only",
            spoken: false,
            confirmSpeakReceiptPresent: false,
          }),
          terminal_eligible: false,
          panel_generated_answer: false,
          next_step_authority: "agent_step_decision",
        },
        message: "Prepared a witness-only Dottie voice proposal from the source event.",
      };
    }

    if (actionId === "create_live_workstation_pipeline") {
      const threadId = asNonEmptyString(args.thread_id ?? args.threadId) ?? "helix-ask:desktop";
      const objective =
        asNonEmptyString(args.objective) ??
        "Create a live workstation pipeline.";
      const request = {
        thread_id: threadId,
        objective,
        source_ids: Array.from(new Set([
          ...asStringArray(args.source_ids ?? args.sourceIds),
          ...asStringArray(args.source_id ?? args.sourceId),
        ])),
        environment_id: asNonEmptyString(args.environment_id ?? args.environmentId) ?? undefined,
        mode: asNonEmptyString(args.mode) ?? "text_only",
        line_schema: Array.isArray(args.line_schema) ? args.line_schema : undefined,
      };
      postLiveWorkstationPipeline(request);
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "live_workstation_pipeline_receipt",
          ok: true,
          request,
          context_policy: "compact_context_pack_only",
          raw_logs_included: false,
          raw_transcript_included: false,
          deterministic_content_role: "observation_not_assistant_answer",
        },
        message: `Created a live workstation pipeline for ${objective}.`,
      };
    }

    if (
      actionId === "pause_live_workstation_pipeline" ||
      actionId === "resume_live_workstation_pipeline" ||
      actionId === "stop_live_workstation_pipeline" ||
      actionId === "set_pipeline_transform" ||
      actionId === "set_pipeline_sink" ||
      actionId === "attach_pipeline_to_live_answer_environment"
    ) {
      const pipelineId = asNonEmptyString(args.pipeline_id ?? args.pipelineId);
      if (!pipelineId) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: `${actionId} requires pipeline_id.`,
        };
      }
      const actionPath =
        actionId === "pause_live_workstation_pipeline"
          ? "pause"
          : actionId === "resume_live_workstation_pipeline"
            ? "resume"
            : actionId === "stop_live_workstation_pipeline"
              ? "stop"
              : null;
      if (actionPath) {
        postLiveEnvironmentControl(`/api/agi/situation/live-workstation-pipeline/${encodeURIComponent(pipelineId)}/${actionPath}`);
      }
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "live_workstation_pipeline_receipt",
          ok: true,
          pipeline_id: pipelineId,
          request: args,
          raw_logs_included: false,
          raw_transcript_included: false,
          context_policy: "compact_context_pack_only",
        },
        message: `Queued ${actionId.replace(/_/g, " ")} for ${pipelineId}.`,
      };
    }

    if (
      actionId === "pause_live_answer_environment" ||
      actionId === "resume_live_answer_environment" ||
      actionId === "stop_live_answer_environment" ||
      actionId === "set_live_line_schema" ||
      actionId === "set_live_answer_line_schema" ||
      actionId === "attach_live_source"
    ) {
      const environmentId = asNonEmptyString(args.environment_id ?? args.environmentId);
      if (!environmentId) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: `${actionId} requires environment_id.`,
        };
      }
      if (actionId === "pause_live_answer_environment") {
        postLiveEnvironmentControl(`/api/agi/situation/live-answer-environment/${encodeURIComponent(environmentId)}/pause`);
      } else if (actionId === "resume_live_answer_environment") {
        postLiveEnvironmentControl(`/api/agi/situation/live-answer-environment/${encodeURIComponent(environmentId)}/resume`);
      } else if (actionId === "stop_live_answer_environment") {
        postLiveEnvironmentControl(`/api/agi/situation/live-answer-environment/${encodeURIComponent(environmentId)}/stop`);
      } else if (actionId === "set_live_line_schema" || actionId === "set_live_answer_line_schema") {
        postLiveEnvironmentControl(`/api/agi/situation/live-answer-environment/${encodeURIComponent(environmentId)}/line-schema`, {
          line_schema: Array.isArray(args.line_schema) ? args.line_schema : [],
        });
      } else {
        const sourceId = asNonEmptyString(args.source_id ?? args.sourceId);
        postLiveEnvironmentControl("/api/agi/situation/live-source/event", {
          source_id: sourceId ?? "source:manual-feed",
          environment_id: environmentId,
          thread_id: asNonEmptyString(args.thread_id ?? args.threadId) ?? "helix-ask:desktop",
          kind: asNonEmptyString(args.kind) ?? asNonEmptyString(args.source_family) ?? "manual_feed",
          panel_id: asNonEmptyString(args.panel_id) ?? panelId,
          event_type: "source_attached",
          payload: {
            attached: true,
            source_id: sourceId ?? "source:manual-feed",
          },
          evidence_refs: [`live_answer_environment:${environmentId}:source_attached`],
        });
      }
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          ...(actionId === "attach_live_source"
            ? {
                schema: HELIX_LIVE_SOURCE_ADMISSION_RECEIPT_SCHEMA,
                receipt_id: `live_source_admission:${Date.now()}`,
                source_id: asNonEmptyString(args.source_id ?? args.sourceId) ?? "source:manual-feed",
                source_kind: "minecraft_world_events",
                transport: "unknown",
                source_identity: {
                  world_id: asNonEmptyString(args.world_id ?? args.worldId) ?? null,
                  server_id: asNonEmptyString(args.server_id ?? args.serverId) ?? null,
                  player_id: asNonEmptyString(args.player_id ?? args.playerId) ?? null,
                  profile_id: asNonEmptyString(args.profile_id ?? args.profileId) ?? null,
                },
                freshness: {
                  status: "unknown",
                  last_seen_at: null,
                  stale_after_ms: null,
                },
                trust_level: "unverified",
                ...helixReceiptNotAnswerFlags,
                evidence_refs: [`live_answer_environment:${environmentId}:source_attached`],
              }
            : {
                kind: "live_answer_environment_receipt",
                ok: true,
                context_role: "observation_not_assistant_answer",
              }),
          environment_id: environmentId,
          thread_id: asNonEmptyString(args.thread_id ?? args.threadId) ?? "helix-ask:desktop",
          room_id: asNonEmptyString(args.room_id ?? args.roomId) ?? "room:minecraft-minehut",
          request: args,
          deterministic: true,
          model_invoked: false,
        },
        message: `Queued ${actionId.replace(/_/g, " ")} for ${environmentId}.`,
      };
    }

    if (
      actionId === "live-source.set_rate" ||
      actionId === "pause_live_source" ||
      actionId === "resume_live_source" ||
      actionId === "stop_live_source" ||
      actionId === "set_live_source_tick_rate"
    ) {
      const sourceId = asNonEmptyString(args.source_id ?? args.sourceId);
      if (!sourceId) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: `${actionId} requires source_id.`,
        };
      }
      if (actionId === "live-source.set_rate") {
        const threadId = asNonEmptyString(args.thread_id ?? args.threadId) ?? "helix-ask:desktop";
        const cadenceMs = typeof args.cadence_ms === "number" ? args.cadence_ms : 15_000;
        const captureMode = asNonEmptyString(args.capture_mode ?? args.captureMode) ?? "interval";
        postLiveEnvironmentControl("/api/agi/situation/live-source/producer/set-cadence", {
          source_id: sourceId,
          producer_id: asNonEmptyString(args.producer_id ?? args.producerId) ?? undefined,
          thread_id: threadId,
          environment_id: asNonEmptyString(args.environment_id ?? args.environmentId) ?? undefined,
          pipeline_id: asNonEmptyString(args.pipeline_id ?? args.pipelineId) ?? undefined,
          modality: asNonEmptyString(args.modality) ?? "visual_frame",
          capture_mode: captureMode,
          cadence_ms: cadenceMs,
          client_stream_confirmed: args.client_stream_confirmed === true,
        });
        return {
          ok: true,
          panel_id: panelId,
          action_id: actionId,
          artifact: {
            kind: "visual_producer_cadence_receipt",
            schema: "helix.visual_producer_cadence_receipt.v1",
            ok: true,
            action_id: "situation-room.live-source.set_rate",
            source_id: sourceId,
            producer_id: asNonEmptyString(args.producer_id ?? args.producerId) ?? null,
            thread_id: threadId,
            cadence_ms: cadenceMs,
            capture_mode: captureMode,
            raw_content_included: false,
            assistant_answer: false,
            context_policy: "compact_context_pack_only",
          },
          message: `Queued visual source cadence ${Math.round(cadenceMs / 1000)}s for ${sourceId}.`,
        };
      }
      const actionPath =
        actionId === "pause_live_source"
          ? "pause"
          : actionId === "resume_live_source"
            ? "resume"
            : actionId === "stop_live_source"
              ? "stop"
              : "tick-rate";
      postLiveEnvironmentControl(`/api/agi/situation/live-source/${encodeURIComponent(sourceId)}/${actionPath}`, {
        tick_rate_ms: typeof args.tick_rate_ms === "number" ? args.tick_rate_ms : undefined,
      });
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "workstation_live_source_receipt",
          ok: true,
          source_id: sourceId,
          action_id: actionId,
          thread_id: asNonEmptyString(args.thread_id ?? args.threadId) ?? "helix-ask:desktop",
          raw_logs_included: false,
          context_policy: "compact_context_pack_only",
        },
        message: `Queued ${actionId.replace(/_/g, " ")} for ${sourceId}.`,
      };
    }

    if (actionId === "mission_memory.refresh") {
      const threadId = asNonEmptyString(args.thread_id ?? args.threadId) ?? "helix-ask:desktop";
      const body = {
        thread_id: threadId,
        room_id: asNonEmptyString(args.room_id ?? args.roomId) ?? null,
        session_id: asNonEmptyString(args.session_id ?? args.sessionId) ?? null,
      };
      postSituationMissionMemoryRefresh(body);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "mission_memory_update",
          ok: true,
          request: body,
          deterministic: true,
          model_invoked: false,
          context_policy: "compact_context_only",
        },
        message: "Requested a compact mission memory refresh.",
      };
    }

    if (actionId === "interjection_investigator.review_latest") {
      const threadId = asNonEmptyString(args.thread_id ?? args.threadId) ?? "helix-ask:desktop";
      const body = {
        thread_id: threadId,
        trigger: asNonEmptyString(args.trigger) ?? "manual_review",
        room_id: asNonEmptyString(args.room_id ?? args.roomId) ?? null,
        session_id: asNonEmptyString(args.session_id ?? args.sessionId) ?? null,
      };
      postInterjectionInvestigation(body);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "interjection_decision",
          ok: true,
          request: body,
          deterministic_gate: true,
          model_invoked: false,
          allowed_outputs: ["silent_keep_in_context", "show_text", "voice_on_confirm", "request_user_input"],
        },
        message: "Requested deterministic interjection review for the latest mission state.",
      };
    }

    if (actionId === "voice_delivery.confirm_speak") {
      const threadId = asNonEmptyString(args.thread_id ?? args.threadId) ?? "helix-ask:desktop";
      const spokenText = asNonEmptyString(args.spoken_text ?? args.spokenText ?? args.text) ?? "";
        const sourceEventId = asNonEmptyString(args.source_event_id ?? args.sourceEventId);
        const proposalId = asNonEmptyString(args.proposal_id ?? args.proposalId);
        const authorityArtifactRef = proposalId ?? sourceEventId ?? `voice_confirm_speak:${Date.now()}`;
        const authorityEvidenceRefs = [proposalId, sourceEventId].filter((entry): entry is string => Boolean(entry));
        const speakAuthority = {
          kind: "operator_callout_v1" as const,
          artifact_ref: authorityArtifactRef,
          evidence_refs: authorityEvidenceRefs.length ? authorityEvidenceRefs : [authorityArtifactRef],
        };
        const receipt = {
          kind: "standby_callout_delivery_receipt",
          schema: "helix.voice_delivery_confirm_speak_receipt.v1",
        ok: true,
        thread_id: threadId,
        request: args,
        spoken: true,
          confirm_speak_receipt_present: true,
          output_authority: "confirmed_spoken",
          speak_authority: speakAuthority,
          spoken_text: spokenText,
        command_lane_enabled: false,
        minecraft_actions_enabled: false,
        assistant_answer: false,
        raw_content_included: false,
        terminal_eligible: false,
        panel_generated_answer: false,
        next_step_authority: "agent_step_decision",
        construct_observation: buildPanelConstructObservation({
          action: "voice_delivery.confirm_speak",
          runId: `voice_confirm_speak:${Date.now()}`,
          constructs: [],
          voicePolicy: "confirm_speak_required",
          spoken: true,
          confirmSpeakReceiptPresent: true,
        }),
      };
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: receipt,
        message: "Confirmed voice delivery for the proposed callout.",
      };
    }

    if (
      actionId.startsWith("live_continuation.") ||
      actionId === "worker_lane.run" ||
      actionId === "goal.evaluate" ||
      actionId === "source_health.query"
    ) {
      const threadId = asNonEmptyString(args.thread_id ?? args.threadId) ?? "helix-ask:desktop";
      const roomId = asNonEmptyString(args.room_id ?? args.roomId) ?? "room:minecraft-minehut";
      const jobId = asNonEmptyString(args.job_id ?? args.jobId);
      const evidenceRefs = Array.isArray(args.evidence_refs)
        ? args.evidence_refs.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        : [];

      if (actionId === "live_continuation.start") {
        postLiveEnvironmentControl("/api/agi/situation/live-continuation/start", {
          thread_id: threadId,
          room_id: roomId,
          objective: asNonEmptyString(args.objective) ?? "Continue monitoring the live situation.",
          environment_id: asNonEmptyString(args.environment_id ?? args.environmentId) ?? null,
          contract_id: asNonEmptyString(args.contract_id ?? args.contractId) ?? null,
          source_ids: Array.isArray(args.source_ids)
            ? args.source_ids
            : asNonEmptyString(args.source_id ?? args.sourceId)
              ? [asNonEmptyString(args.source_id ?? args.sourceId)]
              : [],
          voice_policy: asNonEmptyString(args.voice_policy ?? args.voicePolicy) ?? undefined,
          evidence_threshold: asNonEmptyString(args.evidence_threshold ?? args.evidenceThreshold) ?? undefined,
          lanes_enabled: Array.isArray(args.lanes_enabled) ? args.lanes_enabled : undefined,
          min_tick_interval_ms: typeof args.min_tick_interval_ms === "number" ? args.min_tick_interval_ms : undefined,
        });
        return {
          ok: true,
          panel_id: panelId,
          action_id: actionId,
          artifact: {
            schema: "helix.live_continuation_job_receipt.v1",
            receipt_id: `live_continuation_start:${Date.now()}`,
            action: actionId,
            thread_id: threadId,
            room_id: roomId,
            job_id: jobId ?? null,
            status: "queued",
            mode: "single_agent",
            ...helixReceiptNotAnswerFlags,
            evidence_refs: evidenceRefs,
          },
          message: "Queued live continuation start as a non-terminal receipt.",
        };
      }

      if (actionId === "live_continuation.tick") {
        postLiveEnvironmentControl("/api/agi/situation/live-continuation/tick", {
          job_id: jobId,
          thread_id: threadId,
          room_id: roomId,
          trigger: asNonEmptyString(args.trigger) ?? "manual_refresh",
        });
        return {
          ok: true,
          panel_id: panelId,
          action_id: actionId,
          artifact: {
            schema: HELIX_LIVE_CONTINUATION_TICK_SCHEMA,
            tick_id: `live_continuation_tick:queued:${Date.now()}`,
            job_id: jobId ?? "pending_job_resolution",
            thread_id: threadId,
            room_id: roomId,
            trigger: asNonEmptyString(args.trigger) ?? "manual_refresh",
            status: "queued",
            selected_lanes: [],
            worker_receipt_refs: [],
            next_step: "continue",
            ...helixReceiptNotAnswerFlags,
            evidence_refs: evidenceRefs,
          },
          message: "Queued live continuation tick as a non-terminal receipt.",
        };
      }

      if (
        actionId === "live_continuation.query" ||
        actionId === "live_continuation.pause" ||
        actionId === "live_continuation.resume" ||
        actionId === "live_continuation.stop"
      ) {
        const command = actionId.slice("live_continuation.".length);
        postLiveEnvironmentControl(`/api/agi/situation/live-continuation/${command}`, {
          job_id: jobId,
          thread_id: threadId,
          room_id: roomId,
          source_id: asNonEmptyString(args.source_id ?? args.sourceId) ?? null,
          status: asNonEmptyString(args.status) ?? null,
        });
        return {
          ok: true,
          panel_id: panelId,
          action_id: actionId,
          artifact: {
            schema: "helix.live_continuation_job_receipt.v1",
            receipt_id: `live_continuation_${command}:${Date.now()}`,
            action: actionId,
            thread_id: threadId,
            room_id: roomId,
            job_id: jobId ?? null,
            status: command === "query" ? "read_requested" : "queued",
            ...helixReceiptNotAnswerFlags,
            evidence_refs: evidenceRefs,
          },
          message: `Queued ${actionId} as a non-terminal receipt.`,
        };
      }

      if (actionId === "worker_lane.run") {
        const lane = asNonEmptyString(args.lane) ?? "world_state";
        postLiveEnvironmentControl("/api/agi/situation/live-continuation/worker-lane/run", {
          lane,
          job_id: jobId,
          thread_id: threadId,
          room_id: roomId,
          evidence_refs: evidenceRefs,
        });
        return {
          ok: true,
          panel_id: panelId,
          action_id: actionId,
          artifact: {
            schema: HELIX_WORKER_LANE_RECEIPT_SCHEMA,
            receipt_id: `worker_lane:${lane}:${Date.now()}`,
            lane,
            status: "succeeded",
            summary: "Queued compact procedural lane reducer.",
            hypotheses: [],
            recommended_next_observations: [],
            ...helixHypothesisNotAnswerFlags,
            evidence_refs: evidenceRefs,
          },
          message: "Queued worker lane reducer as a non-terminal receipt.",
        };
      }

      if (actionId === "goal.evaluate") {
        postLiveEnvironmentControl("/api/agi/situation/live-continuation/goal/evaluate", {
          job_id: jobId,
          thread_id: threadId,
          room_id: roomId,
          objective: asNonEmptyString(args.objective) ?? null,
          evidence_refs: evidenceRefs,
        });
        return {
          ok: true,
          panel_id: panelId,
          action_id: actionId,
          artifact: {
            schema: HELIX_GOAL_EVALUATION_RECEIPT_SCHEMA,
            receipt_id: `goal_evaluation:${Date.now()}`,
            job_id: jobId ?? "pending_job_resolution",
            thread_id: threadId,
            room_id: roomId,
            objective_ref: asNonEmptyString(args.objective) ?? null,
            status: "needs_more_observation",
            rationale_codes: ["queued_goal_evaluation"],
            satisfied_evidence_refs: [],
            missing_evidence: evidenceRefs.length ? [] : ["compact_goal_evidence"],
            next_step: "continue",
            ...helixReceiptNotAnswerFlags,
            evidence_refs: evidenceRefs,
          },
          message: "Queued goal evaluation as a non-terminal receipt.",
        };
      }

      const sourceId = asNonEmptyString(args.source_id ?? args.sourceId) ?? jobId ?? "source:unknown";
      postLiveEnvironmentControl("/api/agi/situation/live-continuation/source-health/query", {
        job_id: jobId,
        thread_id: threadId,
        room_id: roomId,
        source_id: sourceId,
      });
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          schema: HELIX_LIVE_SOURCE_ADMISSION_RECEIPT_SCHEMA,
          receipt_id: `source_health:${Date.now()}`,
          thread_id: threadId,
          room_id: roomId,
          source_id: sourceId,
          source_kind: "minecraft_world_events",
          transport: "unknown",
          source_identity: {},
          freshness: { status: "unknown" },
          trust_level: "unverified",
          ...helixReceiptNotAnswerFlags,
          evidence_refs: evidenceRefs,
        },
        message: "Queued source health query as a non-terminal receipt.",
      };
    }

    if (
      actionId === "episode_timeline.summarize_window" ||
      actionId === "situation_context.attach_to_ask" ||
      actionId.startsWith("goal_ledger.") ||
      actionId === "callout_policy.set_mode"
    ) {
      const threadId = asNonEmptyString(args.thread_id ?? args.threadId) ?? "helix-ask:desktop";
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind:
            actionId === "episode_timeline.summarize_window"
              ? "situation_episode_summary"
              : actionId === "situation_context.attach_to_ask"
                ? "situation_context_pack"
                : actionId.startsWith("goal_ledger.")
                  ? "situation_goal_ledger_receipt"
                  : actionId === "callout_policy.set_mode"
                    ? "standby_callout_policy_receipt"
                    : "standby_callout_delivery_receipt",
          ok: true,
          thread_id: threadId,
          request: args,
          command_lane_enabled: false,
          minecraft_actions_enabled: false,
          assistant_answer: false,
          raw_content_included: false,
          terminal_eligible: false,
          panel_generated_answer: false,
          next_step_authority: "agent_step_decision",
        },
        message: `Recorded ${actionId} as a bounded Situation Room tool request.`,
      };
    }
  }

  if (panelId === "workstation-clipboard-history") {
    const args = asRecord(request.args) ?? {};
    const clipboardState = useWorkstationClipboardStore.getState();
    if (actionId === "read_clipboard") {
      const latest = clipboardState.receipts[0] ?? null;
      if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
        void navigator.clipboard
          .readText()
          .then((text) => {
            recordClipboardReceipt({
              direction: "read",
              text,
              source: "workstation-clipboard-history.read_clipboard",
            });
          })
          .catch(() => undefined);
      }
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          text: latest?.text ?? "",
          receipt_id: latest?.id ?? null,
          source: latest ? "history" : "empty",
        },
      };
    }

    if (actionId === "write_clipboard") {
      const text = asNonEmptyString(args.text ?? args.content ?? args.value);
      if (!text) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "workstation-clipboard-history.write_clipboard requires text.",
        };
      }
      const source = asNonEmptyString(args.source) ?? "workstation-clipboard-history.write_clipboard";
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(text).catch(() => undefined);
      }
      recordClipboardReceipt({
        direction: "write",
        text,
        source,
      });
      const latest = useWorkstationClipboardStore.getState().receipts[0] ?? null;
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          text,
          receipt_id: latest?.id ?? null,
          direction: "write",
        },
      };
    }

    if (actionId === "clear_history") {
      const confirmationResult = requireConfirmation(
        request,
        panelId,
        actionId,
        "workstation-clipboard-history.clear_history",
      );
      if (confirmationResult) return confirmationResult;
      const cleared = clipboardState.receipts.length;
      clipboardState.clearReceipts();
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          cleared_count: cleared,
          remaining_count: 0,
        },
      };
    }

    if (actionId === "copy_receipt_to_clipboard") {
      const requestedReceiptId = asNonEmptyString(args.receipt_id);
      const receipt =
        (requestedReceiptId
          ? clipboardState.receipts.find((entry) => entry.id === requestedReceiptId)
          : clipboardState.receipts[0]) ?? null;
      if (!receipt) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "No clipboard receipt available to copy.",
        };
      }
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(receipt.text).catch(() => undefined);
      }
      recordClipboardReceipt({
        direction: "write",
        text: receipt.text,
        source: "workstation-clipboard-history.copy_receipt_to_clipboard",
        meta: { from_receipt_id: receipt.id },
      });
      const latest = useWorkstationClipboardStore.getState().receipts[0] ?? null;
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          from_receipt_id: receipt.id,
          to_receipt_id: latest?.id ?? null,
          text: receipt.text,
        },
      };
    }

    if (actionId === "copy_receipt_to_note") {
      const requestedReceiptId = asNonEmptyString(args.receipt_id);
      const receipt =
        (requestedReceiptId
          ? clipboardState.receipts.find((entry) => entry.id === requestedReceiptId)
          : clipboardState.receipts[0]) ?? null;
      if (!receipt) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "No clipboard receipt available to append to a note.",
        };
      }
      const noteLookup: Record<string, unknown> = {
        note_id: args.note_id,
        title: args.note_title ?? args.title,
      };
      let noteId = resolveNoteId(noteLookup, { allowActiveFallback: true });
      if (!noteId) {
        const notesSnapshot = useWorkstationNotesStore.getState();
        const created = notesSnapshot.upsertWorkflowNote({
          id: buildDeterministicNoteId("Untitled note", Object.keys(notesSnapshot.notes)),
          title: "Untitled note",
          topic: "clipboard",
          body: "",
          citations: [],
          snippets: [],
        });
        noteId = created.id;
      }
      const notesState = useWorkstationNotesStore.getState();
      const current = notesState.notes[noteId];
      const nextBody = current?.body
        ? `${current.body.replace(/\s+$/g, "")}\n${receipt.text}`
        : receipt.text;
      notesState.updateNoteBody(noteId, nextBody);
      notesState.setActiveNote(noteId);
      context.openPanel("workstation-notes", undefined);
      context.focusPanel("workstation-notes", undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          note_id: noteId,
          from_receipt_id: receipt.id,
          appended_text: receipt.text,
          body_length: useWorkstationNotesStore.getState().notes[noteId]?.body.length ?? nextBody.length,
        },
      };
    }

    if (actionId === "copy_selection_to_note") {
      const selectionText =
        typeof window !== "undefined" && typeof window.getSelection === "function"
          ? window.getSelection()?.toString().trim() ?? ""
          : "";
      const fallbackReceipt = clipboardState.receipts[0] ?? null;
      const text = selectionText || fallbackReceipt?.text || "";
      if (!text.trim()) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "No selected text or clipboard receipt available to copy into note.",
        };
      }
      if (selectionText) {
        recordClipboardReceipt({
          direction: "copy",
          text: selectionText,
          source: "workstation-clipboard-history.copy_selection_to_note",
        });
      }
      const noteLookup: Record<string, unknown> = {
        note_id: args.note_id,
        title: args.note_title ?? args.title,
      };
      let noteId = resolveNoteId(noteLookup, { allowActiveFallback: true });
      if (!noteId) {
        const notesSnapshot = useWorkstationNotesStore.getState();
        const created = notesSnapshot.upsertWorkflowNote({
          id: buildDeterministicNoteId("Untitled note", Object.keys(notesSnapshot.notes)),
          title: "Untitled note",
          topic: "selection",
          body: "",
          citations: [],
          snippets: [],
        });
        noteId = created.id;
      }
      const notesState = useWorkstationNotesStore.getState();
      const current = notesState.notes[noteId];
      const nextBody = current?.body ? `${current.body.replace(/\s+$/g, "")}\n${text}` : text;
      notesState.updateNoteBody(noteId, nextBody);
      notesState.setActiveNote(noteId);
      context.openPanel("workstation-notes", undefined);
      context.focusPanel("workstation-notes", undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          note_id: noteId,
          appended_text: text,
          source: selectionText ? "selection" : "clipboard_receipt",
          body_length: useWorkstationNotesStore.getState().notes[noteId]?.body.length ?? nextBody.length,
        },
      };
    }
  }

  if (panelId === "theory-badge-graph") {
    const args = asRecord(request.args) ?? {};
    const graph = buildNhm2TheoryBadgeGraphV1();
    const badgesById = new Map(graph.badges.map((badge) => [badge.id, badge]));
    const incomingByTarget = new Map<string, typeof graph.edges>();
    const outgoingBySource = new Map<string, typeof graph.edges>();
    for (const edge of graph.edges) {
      incomingByTarget.set(edge.to, [...(incomingByTarget.get(edge.to) ?? []), edge]);
      outgoingBySource.set(edge.from, [...(outgoingBySource.get(edge.from) ?? []), edge]);
    }

    if (actionId === "open") {
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "theory_badge_graph_panel_receipt",
          graph_id: graph.graphId,
          badge_count: graph.badges.length,
          edge_count: graph.edges.length,
        },
      };
    }

    if (actionId === "current_context") {
      const currentContext = readTheoryBadgeGraphAskContextSnapshot(Date.now());
      if (currentContext.selected_badge_ids.length === 0) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "No theory badges are currently selected.",
        };
      }
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "theory_badge_graph_current_context",
          schemaVersion: currentContext.schema,
          artifact_v1: currentContext,
          graph_id: currentContext.graph_id,
          selected_badge_ids: currentContext.selected_badge_ids,
          observation_required: true,
          answer_authority: false,
          terminal_eligible: false,
        },
      };
    }

    if (actionId === "list_physics_atlas" || actionId === "list_atlas_blocks") {
      const atlas = buildHelixPhysicsAtlasV1({ graph });
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      const compactBlocks = atlas.blocks.map((block: PhysicsAtlasBlockV1) => ({
        id: block.id,
        title: block.title,
        glyph: block.glyph,
        status: block.status,
        subjects: block.subjects,
        primary_badge_ids: block.primaryBadgeIds,
        calculator_examples: block.calculatorExamples,
        runtime_actions: block.runtimeActions,
        claim_boundary_notes: block.claimBoundaryNotes,
      }));
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: actionId === "list_atlas_blocks" ? "physics_atlas_blocks" : "physics_atlas",
          schemaVersion: atlas.schemaVersion,
          artifact_v1: atlas,
          graph_id: graph.graphId,
          blocks: compactBlocks,
        },
      };
    }

    if (actionId === "plan_calculation_context") {
      const query = asNonEmptyString(args.query ?? args.prompt ?? args.text);
      if (!query) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "theory-badge-graph.plan_calculation_context requires a query or prompt.",
        };
      }
      const atlas = buildHelixPhysicsAtlasV1({ graph });
      const atlasBlockIds = asPhysicsAtlasBlockIds(
        args.atlas_block_ids ?? args.atlasBlockIds,
        args.atlas_block_id ?? args.atlasBlockId ?? args.block_id ?? args.blockId,
      );
      const objectContext = asTheoryCalculatorObjectContext(args.object_context ?? args.objectContext);
      const plan = planHelixPhysicsCalculationContext({
        graph,
        atlas,
        query,
        intent: asPhysicsCalculationIntent(args.intent),
        atlasBlockIds,
        subjects: asStringArray(args.subjects),
        symbols: asStringArray(args.symbols),
        unitSignatures: asStringArray(args.unit_signatures ?? args.unitSignatures),
        equationFamilies: asStringArray(args.equation_families ?? args.equationFamilies),
        simulationOwners: asStringArray(args.simulation_owners ?? args.simulationOwners),
        objectContext,
        variableBindings: asVariableBindings(args.variable_bindings ?? args.variableBindings),
        limit: asNumber(args.limit) ?? undefined,
      });
      if (asBoolean(args.overlay) ?? true) {
        const highlightedBadgeIds = Array.from(new Set([
          ...plan.selectedBadgeIds,
          ...plan.atlasLenses.flatMap((lens) => lens.highlightedBadgeIds),
        ]));
        const highlightedEdgeIds = Array.from(new Set(plan.atlasLenses.flatMap((lens) => lens.highlightedEdgeIds)));
        useTheoryMapOverlayStore.getState().setSelectionOverlay({
          selectedBadgeIds: plan.selectedBadgeIds,
          highlightedBadgeIds,
          highlightedEdgeIds,
          claimBoundaryNotes: plan.claimBoundaryNotes,
        });
        if (atlasBlockIds[0]) useTheoryBadgeGraphPanelStore.getState().setActiveAtlasLensId(atlasBlockIds[0]);
        context.openPanel(panelId, undefined);
        context.focusPanel(panelId, undefined);
      }
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "helix_physics_calculation_context_plan",
          schemaVersion: plan.schemaVersion,
          artifact_v1: plan,
          graph_id: graph.graphId,
          located_badges: plan.locatedBadges,
          selected_badge_ids: plan.selectedBadgeIds,
          next_actions: plan.nextActions,
          commentary_events_preview: plan.commentaryEventsPreview,
          claim_boundary_notes: plan.claimBoundaryNotes,
          warnings: plan.warnings,
        },
      };
    }

    if (actionId === "select_atlas_block" || actionId === "focus_atlas_block") {
      const blockId = asPhysicsAtlasBlockId(args.block_id ?? args.blockId ?? args.atlas_block_id ?? args.atlasBlockId);
      if (!blockId) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: `theory-badge-graph.${actionId} requires a valid atlas_block_id.`,
        };
      }
      const atlas = buildHelixPhysicsAtlasV1({ graph });
      const block = atlas.blocks.find((candidate: PhysicsAtlasBlockV1) => candidate.id === blockId);
      if (!block) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "No atlas block lens matched the request.",
        };
      }
      const lens = resolvePhysicsAtlasLens({ graph, atlas, blockId });
      if (asBoolean(args.overlay) ?? true) {
        useTheoryBadgeGraphPanelStore.getState().setActiveAtlasLensId(blockId);
        useTheoryMapOverlayStore.getState().setSelectionOverlay({
          selectedBadgeIds: lens.centerBadgeIds,
          highlightedBadgeIds: lens.highlightedBadgeIds,
          highlightedEdgeIds: lens.highlightedEdgeIds,
          claimBoundaryNotes: lens.claimBoundaryNotes,
        });
        context.openPanel(panelId, undefined);
        context.focusPanel(panelId, undefined);
      }
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "physics_atlas_lens",
          graph_id: graph.graphId,
          block_id: blockId,
          block,
          lens,
          highlighted_badge_ids: lens.highlightedBadgeIds,
          highlighted_edge_ids: lens.highlightedEdgeIds,
          calculator_examples: lens.calculatorExamples,
          badge_count: lens.highlightedBadgeIds.length,
          edge_count: lens.highlightedEdgeIds.length,
          calculator_example_count: lens.calculatorExamples.length,
          claim_boundary_notes: lens.claimBoundaryNotes,
        },
      };
    }

    if (actionId === "locate_context") {
      const source =
        asNonEmptyString(args.source) === "scientific_calculator" ||
        asNonEmptyString(args.source) === "helix_ask" ||
        asNonEmptyString(args.source) === "playback"
          ? (asNonEmptyString(args.source) as "scientific_calculator" | "helix_ask" | "playback")
          : "manual";
      const locator = buildTheoryBadgeLocatorArtifact({
        graph,
        input: {
          query: asNonEmptyString(args.query ?? args.text ?? args.prompt) ?? undefined,
          expression: asNonEmptyString(args.expression) ?? undefined,
          subjects: asStringArray(args.subjects),
          symbols: asStringArray(args.symbols),
          unitSignatures: asStringArray(args.unit_signatures ?? args.unitSignatures),
          repoPaths: asStringArray(args.repo_paths ?? args.repoPaths),
          equationFamilies: asStringArray(args.equation_families ?? args.equationFamilies),
          simulationOwners: asStringArray(args.simulation_owners ?? args.simulationOwners),
          atlasBlockIds: asPhysicsAtlasBlockIds(
            args.atlas_block_ids ?? args.atlasBlockIds,
            args.atlas_block_id ?? args.atlasBlockId ?? args.block_id ?? args.blockId,
          ),
          source,
          limit: asNumber(args.limit) ?? undefined,
        },
      });
      if (asBoolean(args.overlay) ?? true) {
        useTheoryMapOverlayStore.getState().setLocatorOverlay(locator);
        context.openPanel(panelId, undefined);
        context.focusPanel(panelId, undefined);
      }
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "theory_badge_locator",
          schemaVersion: locator.schemaVersion,
          artifact_v1: locator,
          graph_id: graph.graphId,
          matches: locator.matches,
          overlay: locator.overlay,
          recommended_actions: locator.recommendedActions,
          claim_boundary_notes: locator.claimBoundaryNotes,
        },
      };
    }

    if (actionId === "reflect_discussion_context") {
      const prompt = asNonEmptyString(args.prompt ?? args.query ?? args.text);
      if (!prompt) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "theory-badge-graph.reflect_discussion_context requires a prompt, query, or text.",
        };
      }

      const receipt = runClientTheoryContextReflectionTool({
        prompt,
        conversationContext: asNonEmptyString(args.conversation_context ?? args.conversationContext) ?? null,
        mentionedEquations: asStringArray(args.mentioned_equations ?? args.mentionedEquations),
        mentionedSymbols: asStringArray(args.mentioned_symbols ?? args.mentionedSymbols),
        mentionedDomains: asStringArray(args.mentioned_domains ?? args.mentionedDomains),
        confidenceMode: asTheoryContextReflectionConfidenceMode(args.confidence_mode ?? args.confidenceMode),
        source: asTheoryContextReflectionSource(args.source),
        limit: asNumber(args.limit) ?? undefined,
        turnId: asNonEmptyString(args.turn_id ?? args.turnId) ?? `panel:${Date.now()}`,
        threadId: asNonEmptyString(args.thread_id ?? args.threadId) ?? "helix-ask:desktop",
        buildExplanationPlan: asBoolean(args.build_explanation_plan ?? args.buildExplanationPlan) ?? false,
        syncPanel: asBoolean(args.overlay) ?? true,
        overlayMode: "discussion_zone",
        openPanel: asBoolean(args.open_panel ?? args.openPanel) ?? true,
        openPanelHandler: (targetPanelId: string) => context.openPanel(targetPanelId, undefined),
        focusPanelHandler: (targetPanelId: string) => context.focusPanel(targetPanelId, undefined),
      });
      const reflection = receipt.reflectionV1;

      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "theory_context_reflection",
          schemaVersion: reflection.schemaVersion,
          artifact_v1: reflection,
          tool_receipt_v1: receipt,
          graph_id: graph.graphId,
          exact_badge_ids: reflection.overlay.exactBadgeIds,
          likely_badge_ids: reflection.overlay.likelyBadgeIds,
          soft_region: reflection.overlay.softRegion,
          evidence_for_ask: reflection.evidenceForAsk,
          claim_boundary_notes: reflection.evidenceForAsk.claimBoundaries,
          assistant_answer: false,
          raw_content_included: false,
          terminal_eligible: false,
          panel_generated_answer: false,
          context_role: "tool_evidence",
          ask_context_policy: "evidence_only",
          deterministic_content_role: "observation_not_assistant_answer",
        },
      };
    }

    if (actionId === "propose_frontier_conjectures") {
      const prompt = asNonEmptyString(args.prompt ?? args.query ?? args.text);
      if (!prompt) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "theory-badge-graph.propose_frontier_conjectures requires a prompt, query, or text.",
        };
      }

      const receipt = runClientTheoryContextReflectionTool({
        prompt,
        conversationContext: asNonEmptyString(args.conversation_context ?? args.conversationContext) ?? null,
        mentionedEquations: asStringArray(args.mentioned_equations ?? args.mentionedEquations),
        mentionedSymbols: asStringArray(args.mentioned_symbols ?? args.mentionedSymbols),
        mentionedDomains: asStringArray(args.mentioned_domains ?? args.mentionedDomains),
        confidenceMode: asTheoryContextReflectionConfidenceMode(args.confidence_mode ?? args.confidenceMode),
        source: asTheoryContextReflectionSource(args.source),
        limit: asNumber(args.limit) ?? undefined,
        turnId: asNonEmptyString(args.turn_id ?? args.turnId) ?? `panel:${Date.now()}`,
        threadId: asNonEmptyString(args.thread_id ?? args.threadId) ?? "helix-ask:desktop",
        buildExplanationPlan: true,
        buildFrontierSearch: true,
        frontierSearchSeed: asNonEmptyString(args.frontier_search_seed ?? args.frontierSearchSeed),
        syncPanel: asBoolean(args.overlay) ?? true,
        overlayMode: "discussion_zone",
        openPanel: asBoolean(args.open_panel ?? args.openPanel) ?? true,
        openPanelHandler: (targetPanelId: string) => context.openPanel(targetPanelId, undefined),
        focusPanelHandler: (targetPanelId: string) => context.focusPanel(targetPanelId, undefined),
      });
      const frontierSearch = receipt.frontierSearchV1;
      if (!frontierSearch) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "Theory frontier search did not produce a workbench artifact.",
        };
      }
      const forbiddenClaimNotes = theoryFrontierConjectureForbiddenClaimNotes(prompt);
      const workbench = buildTheoryFrontierConjectureWorkbenchV1(
        frontierSearch,
        receipt.recommendedNextActions,
        forbiddenClaimNotes,
      );

      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "theory_frontier_conjecture_workbench",
          schemaVersion: THEORY_FRONTIER_CONJECTURE_WORKBENCH_SCHEMA_VERSION,
          artifact_v1: workbench,
          frontier_search_v1: frontierSearch,
          tool_receipt_v1: receipt,
          graph_id: graph.graphId,
          candidates: workbench.candidates,
          candidate_count: workbench.candidates.length,
          candidate_status_counts: workbench.candidate_status_counts,
          top_candidate_id: workbench.top_candidate_id,
          scholarly_lookup_requests: frontierSearch.scholarlyLookupRequests,
          exact_verification_results: receipt.frontierExactVerificationResultsV1,
          probability_terrain: workbench.probability_terrain,
          forbidden_claim_scan_notes: forbiddenClaimNotes,
          assistant_answer: false,
          raw_content_included: false,
          terminal_eligible: false,
          post_tool_model_step_required: true,
        },
      };
    }

    if (actionId === "explain_reflected_context") {
      const reflectionArg = asRecord(args.reflection ?? args.artifact_v1 ?? args.artifactV1);
      const nestedReflectionArg = asRecord(reflectionArg?.artifact_v1 ?? reflectionArg?.artifactV1);
      const storedReflection = useTheoryMapOverlayStore.getState().lastReflectionArtifact;
      let reflection =
        (reflectionArg && isTheoryContextReflectionV1(reflectionArg) ? reflectionArg : null) ??
        (nestedReflectionArg && isTheoryContextReflectionV1(nestedReflectionArg) ? nestedReflectionArg : null) ??
        storedReflection;

      if (!reflection) {
        const prompt = asNonEmptyString(args.prompt ?? args.query ?? args.text);
        if (!prompt) {
          return {
            ok: false,
            panel_id: panelId,
            action_id: actionId,
            message:
              "theory-badge-graph.explain_reflected_context requires a reflection artifact or prompt.",
          };
        }
        reflection = buildTheoryContextReflection({
          graph,
          prompt,
          conversationContext: asNonEmptyString(args.conversation_context ?? args.conversationContext),
          mentionedEquations: asStringArray(args.mentioned_equations ?? args.mentionedEquations),
          mentionedSymbols: asStringArray(args.mentioned_symbols ?? args.mentionedSymbols),
          mentionedDomains: asStringArray(args.mentioned_domains ?? args.mentionedDomains),
          confidenceMode: asTheoryContextReflectionConfidenceMode(args.confidence_mode ?? args.confidenceMode),
          source: asTheoryContextReflectionSource(args.source),
          limit: asNumber(args.limit) ?? undefined,
        });
      }

      const plan = buildTheoryContextExplanationPlan({
        graph,
        reflection,
      });

      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "theory_context_explanation_plan",
          schemaVersion: plan.schemaVersion,
          artifact_v1: plan,
          graph_id: graph.graphId,
          reflection_id: plan.reflectionId,
          selected_badge_ids: plan.selectedBadgeIds,
          explanation_steps: plan.explanationSteps,
          scalar_cut_badge_ids: plan.scalarCutBadgeIds,
          runtime_trace_badge_ids: plan.runtimeTraceBadgeIds,
          claim_boundary_notes: plan.claimBoundaryNotes,
          recommended_next_actions: plan.recommendedNextActions,
          assistant_answer: false,
          raw_content_included: false,
          terminal_eligible: false,
          panel_generated_answer: false,
          context_role: "tool_evidence",
          ask_context_policy: "evidence_only",
          deterministic_content_role: "observation_not_assistant_answer",
        },
      };
    }

    if (actionId === "lookup_badges") {
      const matches = locateTheoryBadges({
        graph,
        input: {
          query: asNonEmptyString(args.query ?? args.text ?? args.prompt) ?? undefined,
          subjects: asStringArray(args.subjects),
          symbols: asStringArray(args.symbols),
          unitSignatures: asStringArray(args.unit_signatures ?? args.unitSignatures),
          repoPaths: asStringArray(args.repo_paths ?? args.repoPaths),
          equationFamilies: asStringArray(args.equation_families ?? args.equationFamilies),
          simulationOwners: asStringArray(args.simulation_owners ?? args.simulationOwners),
          atlasBlockIds: asPhysicsAtlasBlockIds(
            args.atlas_block_ids ?? args.atlasBlockIds,
            args.atlas_block_id ?? args.atlasBlockId ?? args.block_id ?? args.blockId,
          ),
          limit: asNumber(args.limit) ?? undefined,
        },
      });
      const matchedBadges = matches
        .map((match) => badgesById.get(match.badgeId))
        .filter((entry): entry is TheoryBadgeV1 => Boolean(entry));
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "theory_badge_lookup",
          graph_id: graph.graphId,
          matches,
          claim_boundary_notes: claimBoundaryNotesForBadges(matchedBadges),
        },
      };
    }

    if (actionId === "get_badge_context") {
      const badgeId = asNonEmptyString(args.badge_id ?? args.badgeId ?? args.id);
      const badge = badgeId ? badgesById.get(badgeId) : null;
      if (!badgeId || !badge) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "theory-badge-graph.get_badge_context requires a valid badge_id.",
        };
      }
      const includeNeighbors = asBoolean(args.include_neighbors ?? args.includeNeighbors) ?? true;
      const includePayloads = asBoolean(args.include_payloads ?? args.includePayloads) ?? true;
      const upstreamBadges = includeNeighbors
        ? (incomingByTarget.get(badge.id) ?? [])
            .map((edge) => badgesById.get(edge.from))
            .filter((entry): entry is TheoryBadgeV1 => Boolean(entry))
        : [];
      const downstreamBadges = includeNeighbors
        ? (outgoingBySource.get(badge.id) ?? [])
            .map((edge) => badgesById.get(edge.to))
            .filter((entry): entry is TheoryBadgeV1 => Boolean(entry))
        : [];
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "theory_badge_context",
          graph_id: graph.graphId,
          badge,
          upstream_badges: upstreamBadges,
          downstream_badges: downstreamBadges,
          calculator_payloads: includePayloads ? badge.calculatorPayloads : [],
          units: badge.units,
          assumptions: badge.assumptions,
          source_refs: badge.sourceRefs,
          claim_boundary: badge.claimBoundary,
          claim_boundary_notes: claimBoundaryNotesForBadges([badge, ...upstreamBadges, ...downstreamBadges]),
        },
      };
    }

    if (actionId === "load_payloads_to_calculator") {
      const badgeId = asNonEmptyString(args.badge_id ?? args.badgeId);
      const badge = badgeId ? badgesById.get(badgeId) : null;
      if (!badgeId || !badge) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "theory-badge-graph.load_payloads_to_calculator requires a valid badge_id.",
        };
      }
      const requestedPayloadIds = asStringArray(args.payload_ids ?? args.payloadIds);
      const loadMode = asNonEmptyString(args.load_mode ?? args.loadMode) === "all" ? "all" : "primary";
      const selectedPayloads =
        requestedPayloadIds.length > 0
          ? badge.calculatorPayloads.filter((payload) => requestedPayloadIds.includes(payload.id))
          : loadMode === "all"
            ? badge.calculatorPayloads
            : badge.calculatorPayloads.slice(0, 1);
      const compoundRunId = asNonEmptyString(args.compound_run_id ?? args.compoundRunId);
      const scientificState = useScientificCalculatorStore.getState();
      const loadedPayloads = selectedPayloads.map((payload) => {
        scientificState.ingestLatex(payload.displayLatex || payload.expression, {
          sourcePath: `theory://${graph.graphId}/${badge.id}/${payload.id}`,
          anchor: payload.id,
          source: "workstation_action",
          calculatorSetup: payload.setupContext ?? null,
          compoundRunId,
          compoundSubgoalId: `${badge.id}:${payload.id}`,
          targetWorkbench: "scalar",
        });
        return {
          badge_id: badge.id,
          payload_id: payload.id,
          expression: payload.expression,
          display_latex: payload.displayLatex,
        };
      });
      context.openPanel("scientific-calculator", undefined);
      context.focusPanel("scientific-calculator", undefined);
      return {
        ok: loadedPayloads.length > 0,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "theory_badge_calculator_loadout",
          graph_id: graph.graphId,
          badge_id: badge.id,
          loaded_payloads: loadedPayloads,
          calculator_focused: true,
          target_workbench: "scalar",
        },
        message: loadedPayloads.length > 0 ? undefined : "No calculator payloads matched the request.",
      };
    }

    if (actionId === "trace_badges") {
      const badgeIds = asStringArray(args.badge_ids ?? args.badgeIds ?? args.ids);
      if (badgeIds.length === 0) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "theory-badge-graph.trace_badges requires badge_ids.",
        };
      }
      const trace = traceTheoryBadgeConnections({ graph, badgeIds });
      if (asBoolean(args.overlay) ?? true) {
        useTheoryMapOverlayStore.getState().setSelectionOverlay({
          selectedBadgeIds: trace.selectedBadgeIds,
          highlightedBadgeIds: trace.connectingBadgeIds,
          highlightedEdgeIds: trace.pathSegments.flatMap((segment) => segment.edgeIds),
          claimBoundaryNotes: trace.claimBoundaryNotes,
        });
      }
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: trace.selectedBadgeIds.length > 0,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "theory_badge_connection_trace",
          graph_id: graph.graphId,
          selected_badge_ids: trace.selectedBadgeIds,
          connecting_badge_ids: trace.connectingBadgeIds,
          connecting_edge_ids: trace.pathSegments.flatMap((segment) => segment.edgeIds),
          shared_ancestor_ids: trace.sharedAncestorIds,
          shared_subjects: trace.sharedSubjects,
          shared_symbols: trace.sharedSymbols,
          shared_unit_signatures: trace.sharedUnitSignatures,
          path_segments: trace.pathSegments,
          claim_boundary_notes: trace.claimBoundaryNotes,
          warnings: trace.warnings,
        },
      };
    }

    if (actionId === "clear_overlay") {
      useTheoryMapOverlayStore.getState().clearOverlay();
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "theory_badge_overlay_cleared",
          graph_id: graph.graphId,
        },
      };
    }

    if (
      actionId === "build_calculator_loadout" ||
      actionId === "load_calculator_loadout" ||
      actionId === "solve_calculator_loadout"
    ) {
      const loadout = buildTheoryLoadoutFromActionArgs(args, graph);
      if (loadout.targetBadgeIds.length === 0) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: `${panelId}.${actionId} requires badge_ids, badge_id, target_badge_id, or a valid loadout.`,
        };
      }
      if (actionId === "build_calculator_loadout") {
        return {
          ok: true,
          panel_id: panelId,
          action_id: actionId,
          artifact: {
            kind: "theory_calculator_loadout",
            artifact_v1: loadout,
            graph_id: graph.graphId,
            scalar_count: loadout.summary.scalarCount,
            context_count: loadout.summary.contextCount,
            claim_boundary_notes: loadout.claimBoundaryNotes,
            target_workbench: "theory",
          },
        };
      }

      const scientificState = useScientificCalculatorStore.getState();
      scientificState.setTheoryLoadout(loadout);
      const firstScalar = loadout.items.find((item) => item.kind === "calculator_payload");
      if (firstScalar) scientificState.loadTheoryLoadoutItem(firstScalar.index);
      const solveScope = asNonEmptyString(args.solve_scope ?? args.solveScope) === "all_scalar_and_runtime"
        ? "all_scalar_and_runtime"
        : "all_scalar";
      const targetWorkbench = solveScope === "all_scalar_and_runtime" ? "runtime" : "theory";
      const finalLoadout =
        actionId === "solve_calculator_loadout"
          ? solveTheoryCalculatorLoadoutNow(loadout, {
              solveScope,
              runRuntime: solveScope === "all_scalar_and_runtime",
            })
          : useScientificCalculatorStore.getState().lastTheoryLoadout ?? loadout;
      context.openPanel("scientific-calculator", undefined);
      context.focusPanel("scientific-calculator", undefined);
      return {
        ok: finalLoadout.summary.scalarCount > 0 || finalLoadout.summary.contextCount > 0,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: actionId === "solve_calculator_loadout" ? "theory_calculator_loadout_solve" : "theory_calculator_loadout_loaded",
          artifact_v1: finalLoadout,
          graph_id: graph.graphId,
          loaded_scalar_count: finalLoadout.summary.scalarCount,
          context_count: finalLoadout.summary.contextCount,
          solved_count: finalLoadout.summary.solvedCount,
          runtime_receipt_count: finalLoadout.summary.runtimeReceiptCount,
          failed_count: finalLoadout.summary.failedCount,
          claim_boundary_notes: finalLoadout.claimBoundaryNotes,
          calculator_focused: true,
          target_workbench: targetWorkbench,
        },
      };
    }

    if (actionId === "build_compound_theory_run") {
      const run = buildTheoryCompoundRunFromActionArgs(args, graph);
      if (!run) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "theory-badge-graph.build_compound_theory_run requires badge_ids, badge_id, target_badge_id, atlas_block_id, or a valid run.",
        };
      }
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "theory_compound_run",
          schemaVersion: run.schemaVersion,
          artifact_v1: run,
          graph_id: graph.graphId,
          row_count: run.summary.rowCount,
          scalar_count: run.summary.scalarCount,
          tensor_count: run.summary.tensorCount,
          runtime_count: run.summary.runtimeCount,
          boundary_count: run.summary.boundaryCount,
          claim_boundary_notes: Array.from(new Set(run.rows.flatMap((row) => row.claimBoundaryNotes))),
          target_workbench: "theory",
        },
      };
    }

    if (actionId === "load_compound_theory_run" || actionId === "solve_compound_theory_run") {
      const run = buildTheoryCompoundRunFromActionArgs(args, graph);
      if (!run) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: `theory-badge-graph.${actionId} requires a valid theory_compound_run/v1 payload or badge selection.`,
        };
      }
      const finalRun =
        actionId === "solve_compound_theory_run"
          ? runTheoryCompoundRunNow({
              run,
              scope: asTheoryCompoundRunSolveScope(args.solve_scope ?? args.solveScope ?? args.scope),
            })
          : run;
      useTheoryCompoundRunStore.getState().loadTheoryRun(finalRun);
      useTheoryCompoundRunStore.getState().setTheoryRunStatus(
        actionId === "solve_compound_theory_run"
          ? finalRun.summary.failedCount > 0
            ? "failed"
            : "complete"
          : "loaded",
      );
      context.openPanel("scientific-calculator", undefined);
      context.focusPanel("scientific-calculator", undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: actionId === "solve_compound_theory_run" ? "theory_compound_run_solved" : "theory_compound_run_loaded",
          schemaVersion: finalRun.schemaVersion,
          artifact_v1: finalRun,
          graph_id: graph.graphId,
          row_count: finalRun.summary.rowCount,
          scalar_count: finalRun.summary.scalarCount,
          solved_count: finalRun.summary.solvedCount,
          computed_count: finalRun.summary.computedCount,
          blocked_count: finalRun.summary.blockedCount,
          failed_count: finalRun.summary.failedCount,
          claim_boundary_notes: Array.from(new Set(finalRun.rows.flatMap((row) => row.claimBoundaryNotes))),
          calculator_focused: true,
          target_workbench: "theory",
        },
      };
    }

    if (actionId === "get_runtime_math_trace") {
      const trace = buildRuntimeMathTraceFromActionArgs(args, graph);
      if (!trace) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "theory-badge-graph.get_runtime_math_trace requires a recognized runtime family or badge.",
        };
      }
      useTheoryCompoundRunStore.getState().setActiveRuntimeTrace(trace);
      context.openPanel("scientific-calculator", undefined);
      context.focusPanel("scientific-calculator", undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "theory_runtime_math_trace",
          schemaVersion: trace.schemaVersion,
          artifact_v1: trace,
          graph_id: graph.graphId,
          runtime_id: trace.runtimeId,
          family: trace.request.family,
          step_count: trace.summary.stepCount,
          scalar_cut_count: trace.summary.scalarCutCount,
          claim_boundary_notes: trace.summary.claimBoundaryNotes,
          warnings: Array.from(new Set(trace.steps.flatMap((step) => step.warnings))),
          calculator_focused: true,
          target_workbench: "runtime",
        },
      };
    }

    if (actionId === "load_scalar_cut_to_calculator") {
      const scalarCut = scalarCutExpressionFromActionArgs(args);
      if (!scalarCut.expression) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "theory-badge-graph.load_scalar_cut_to_calculator requires a scalar cut expression.",
        };
      }
      useScientificCalculatorStore.getState().ingestLatex(scalarCut.expression, {
        sourcePath: scalarCut.sourcePath ?? "theory-runtime://scalar-cut",
        anchor: scalarCut.anchor,
        source: "workstation_action",
        compoundRunId: asNonEmptyString(args.compound_run_id ?? args.compoundRunId ?? args.run_id ?? args.runId),
        compoundSubgoalId: scalarCut.anchor,
        targetWorkbench: "scalar",
      });
      context.openPanel("scientific-calculator", undefined);
      context.focusPanel("scientific-calculator", undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "theory_scalar_cut_loaded",
          expression: scalarCut.expression,
          source_path: scalarCut.sourcePath ?? "theory-runtime://scalar-cut",
          anchor: scalarCut.anchor,
          calculator_focused: true,
          target_workbench: "scalar",
        },
      };
    }

    if (actionId === "run_runtime_badge") {
      const badgeId = asNonEmptyString(args.badge_id ?? args.badgeId);
      const objectContext = asTheoryCalculatorObjectContext(args.object_context ?? args.objectContext);
      if (!badgeId || !badgesById.has(badgeId) || !objectContext) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "theory-badge-graph.run_runtime_badge requires a valid badge_id and object_context.",
        };
      }
      const receipt = runStarSimRuntimeBadge({
        badgeId,
        objectContext,
        includeRawEvaluation: asBoolean(args.include_raw_evaluation ?? args.includeRawEvaluation) ?? false,
      });
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "starsim_runtime_receipt",
          artifact_v1: receipt,
          badge_id: badgeId,
          dominant_fusion_channel: receipt.outputSummary.dominantFusionChannel,
          fusion_zone_mode: receipt.outputSummary.fusionZoneMode,
          claim_boundary_notes: receipt.claimBoundaryNotes,
        },
      };
    }

    if (actionId === "run_badge_path") {
      const targetBadgeId = asNonEmptyString(args.target_badge_id ?? args.targetBadgeId ?? args.badge_id ?? args.badgeId);
      if (!targetBadgeId || !badgesById.has(targetBadgeId)) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "theory-badge-graph.run_badge_path requires a valid target_badge_id.",
        };
      }
      const playback = runTheoryBadgePlaybackNow({
        graph,
        targetBadgeId,
        source: "workstation_action",
      });
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      return {
        ok: playback.summary.ok,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "theory_badge_playback",
          graph_id: graph.graphId,
          target_badge_id: targetBadgeId,
          artifact_v1: playback,
          solved_count: playback.summary.solvedCount,
          skipped_count: playback.summary.skippedCount,
          failed_count: playback.summary.failedCount,
        },
      };
    }
  }

  if (panelId === "scientific-calculator") {
    const args = asRecord(request.args) ?? {};
    const scientificState = useScientificCalculatorStore.getState();
    const calculatorSetup = asCalculatorSetupContext(args.calculator_setup ?? args.setup_context ?? args.setup);
    const compoundRunId = asNonEmptyString(args.compound_run_id ?? args.run_id ?? args.turn_id);
    const compoundSubgoalId = asNonEmptyString(args.compound_subgoal_id ?? args.subgoal_id);
    const targetWorkbench = compoundRunId ? "theory" : "scalar";

    if (actionId === "ingest_latex" || actionId === "prefill_expression") {
      const rawLatex = asNonEmptyString(args.latex ?? args.expression ?? args.text);
      let latex = rawLatex === "$clipboard" ? rawLatex : resolveCalculatorActionLatex(rawLatex, calculatorSetup);
      if (rawLatex === "$clipboard" && typeof navigator !== "undefined" && navigator.clipboard?.readText) {
        // Non-blocking clipboard fallback for deterministic action calls.
        void navigator.clipboard.readText().then((clipboardText) => {
          const trimmed = clipboardText.trim();
          if (!trimmed) return;
          scientificState.ingestLatex(trimmed, {
            sourcePath: "clipboard",
            anchor: null,
            source: "clipboard",
            calculatorSetup,
          });
          useWorkstationSessionMemoryStore.getState().rememberDraft(SCIENTIFIC_CALCULATOR_DRAFT_KEY, trimmed);
          dispatchScientificCalculatorMathPicked({
            latex: trimmed,
            sourcePath: "clipboard",
            source: "clipboard",
          });
        });
      }
      if (!latex || latex === "$clipboard") {
        return {
          ok: rawLatex === "$clipboard",
          panel_id: panelId,
          action_id: actionId,
          message:
            rawLatex === "$clipboard"
              ? "Attempting clipboard ingest for scientific-calculator."
              : `scientific-calculator.${actionId} requires a calculator expression, not prose.`,
        };
      }
      const sourcePath = asNonEmptyString(args.source_path ?? args.path ?? args.source);
      const anchor = asNonEmptyString(args.anchor);
      const entry = scientificState.ingestLatex(latex, {
        actionId: actionId === "prefill_expression" ? "prefill_expression" : "ingest_latex",
        sourcePath,
        anchor,
        source: "workstation_action",
        calculatorSetup,
        compoundRunId,
        compoundSubgoalId,
      });
      dispatchScientificCalculatorMathPicked({
        latex: entry.latex,
        sourcePath: entry.sourcePath,
        anchor: entry.anchor,
        source: "workstation_action",
      });
      useWorkstationSessionMemoryStore.getState().rememberDraft(SCIENTIFIC_CALCULATOR_DRAFT_KEY, entry.latex);
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      const latestDebugEvents = useScientificCalculatorStore.getState().debugEvents;
      const ingestDebugEvent =
        latestDebugEvents.find((event) => event.action_id === actionId && event.source === "workstation_action") ??
        latestDebugEvents[0] ??
        null;
      const classification = classifyScientificCalculatorExpression(entry.latex);
      const missingBindings = [
        ...classification.missing_variables.map((symbol) => `variable:${symbol}`),
        ...classification.required_assumptions.map((assumption) => `assumption:${assumption}`),
      ];
      const calculatorReceipt = scientificState.recordCalculatorReceipt({
        expression_template_id: entry.id,
        status: classification.blocked_reasons.length > 0 || missingBindings.length > 0
          ? "blocked"
          : classification.possible_routes.includes("arithmetic_safe")
            ? "calculation_ready"
            : "template_only",
        expression: classification.normalized_expression ?? entry.latex,
        latex: entry.latex,
        variables: classification.detected_symbols.map((symbol) => ({
          symbol,
          value: null,
          unit: entry.calculatorSetup?.input_units?.[symbol] ?? null,
          source_refs: [],
        })),
        assumptions: classification.required_assumptions,
        source_refs: [
          ...(entry.sourcePath ? [entry.sourcePath] : []),
          ...(entry.anchor ? [entry.anchor] : []),
        ],
        dimensional_check_status: missingBindings.length > 0 ? "missing_units" : "not_run",
        missing_bindings: missingBindings,
        blockers: classification.blocked_reasons,
        provenance_refs: [entry.id],
      });
      const latestReceiptDebugEvents = useScientificCalculatorStore.getState().debugEvents;
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: actionId === "prefill_expression" ? "calculator_expression_prefill" : "calculator_latex_ingest",
          schema: actionId === "prefill_expression"
            ? "helix.calculator_expression_prefill_receipt.v1"
            : "helix.calculator_latex_ingest_receipt.v1",
          latex: entry.latex,
          source_path: entry.sourcePath,
          anchor: entry.anchor,
          classification,
          produced_calculator_receipt: true,
          calculator_receipt: calculatorReceipt,
          calculator_receipt_ref: calculatorReceipt.receipt_id,
          calculator_receipt_status: calculatorReceipt.status,
          produced_numeric_value_evidence: false,
          terminal_eligible: false,
          assistant_answer: false,
          calculator_setup: entry.calculatorSetup ?? null,
          history_id: entry.id,
          debug_event: ingestDebugEvent,
          debug_log_tail: buildScientificCalculatorDebugSnapshot(latestReceiptDebugEvents, 8),
        },
      };
    }

    if (actionId === "solve_expression" || actionId === "solve_with_steps") {
      const rawLatexArg = asNonEmptyString(args.latex ?? args.expression ?? args.text);
      const latexArg = resolveCalculatorActionLatex(rawLatexArg, calculatorSetup);
      if (rawLatexArg && !latexArg) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "scientific-calculator.solve_expression requires a calculator expression, not prose.",
        };
      }
      const latex = latexArg ?? scientificState.currentLatex;
      if (!latex.trim()) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "No calculator input available to solve.",
        };
      }
      if (latexArg) {
        scientificState.ingestLatex(latexArg, {
          sourcePath: asNonEmptyString(args.source_path ?? args.path ?? args.source),
          anchor: asNonEmptyString(args.anchor),
          source: "workstation_action",
          calculatorSetup,
          compoundRunId,
          compoundSubgoalId,
          targetWorkbench,
        });
      }
      useWorkstationSessionMemoryStore.getState().rememberDraft(SCIENTIFIC_CALCULATOR_DRAFT_KEY, latex);
      const solveResult = runScientificSolve(latex, actionId === "solve_with_steps");
      scientificState.setSolveResult(solveResult, {
        actionId: actionId === "solve_with_steps" ? "solve_with_steps" : "solve_expression",
        source: "workstation_action",
        calculatorSetup,
        compoundRunId,
        compoundSubgoalId,
        targetWorkbench,
      });
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      const latestCalculatorState = useScientificCalculatorStore.getState();
      const calculatorReceipt = latestCalculatorState.lastCalculatorReceipt;
      return {
        ok: solveResult.ok,
        panel_id: panelId,
        action_id: actionId,
        message: solveResult.ok ? undefined : solveResult.error ?? "Solve failed.",
        artifact: {
          mode: solveResult.mode,
          normalized_expression: solveResult.normalized_expression,
          result_text: solveResult.result_text,
          result_latex: solveResult.result_latex ?? "",
          calculator_setup: calculatorSetup,
          result_unit: calculatorSetup?.result_unit ?? null,
          result_quantity: calculatorSetup?.result_quantity ?? calculatorSetup?.quantity ?? null,
          result_dimension: calculatorSetup?.result_dimension ?? null,
          result_dimension_signature: calculatorSetup?.result_dimension_signature ?? null,
          unit_system: calculatorSetup?.unit_system ?? null,
          input_units: calculatorSetup?.input_units ?? null,
          unit_options: calculatorSetup?.unit_options ?? [],
          assumptions: calculatorSetup?.assumptions ?? [],
          variable: solveResult.variable,
          steps_count: solveResult.steps.length,
          steps: solveResult.steps,
          artifact_v1: solveResult.artifact_v1 ?? null,
          result_kind: solveResult.artifact_v1?.result.kind ?? null,
          confidence: solveResult.artifact_v1?.quality.confidence ?? null,
          fallback_reason: solveResult.artifact_v1?.quality.fallbackReason ?? null,
          trace: solveResult.trace,
          route: solveResult.trace.route,
          engine: solveResult.trace.engine,
          sourceOfTruth: solveResult.trace.sourceOfTruth,
          capabilityClass: solveResult.trace.capabilityClass,
          warnings: solveResult.trace.warnings,
          target_workbench: targetWorkbench,
          error: solveResult.error ?? null,
          produced_calculator_receipt: Boolean(calculatorReceipt),
          calculator_receipt: calculatorReceipt,
          calculator_receipt_ref: calculatorReceipt?.receipt_id ?? null,
          calculator_receipt_status: calculatorReceipt?.status ?? null,
          debug_event: latestCalculatorState.debugEvents[0] ?? null,
          debug_log_tail: buildScientificCalculatorDebugSnapshot(latestCalculatorState.debugEvents, 8),
        },
      };
    }

    if (actionId === "show_gateway_solve") {
      const expression = asNonEmptyString(args.expression ?? args.latex ?? args.text);
      const resultText = asNonEmptyString(args.result ?? args.result_text ?? args.value);
      if (!expression || !resultText) {
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "scientific-calculator.show_gateway_solve requires an observed expression and result.",
        };
      }
      const normalizedExpression = asNonEmptyString(args.normalized_expression ?? args.normalizedExpression) ?? expression;
      const observationRef = asNonEmptyString(args.observation_ref ?? args.observationRef);
      const sourceCapability = asNonEmptyString(args.source_capability ?? args.sourceCapability) ?? "scientific-calculator.solve_expression";
      const historyEntry = scientificState.ingestLatex(expression, {
        sourcePath: sourceCapability,
        anchor: observationRef,
        source: "workstation_action",
        calculatorSetup,
        compoundRunId,
        compoundSubgoalId,
        targetWorkbench,
      });
      const projectedSolve: ScientificSolveResult = {
        ok: true,
        mode: normalizedExpression.includes("=") ? "equation" : "expression",
        input_latex: expression,
        normalized_expression: normalizedExpression,
        variable: null,
        result_text: resultText,
        result_latex: resultText,
        steps: [
          { id: "input", label: "Observed Expression", value: expression },
          { id: "gateway_observation", label: "Gateway Observation", value: resultText },
        ],
        trace: {
          traceId: observationRef ?? `scicalc-gateway:${Date.now().toString(36)}`,
          runId: observationRef ?? `scicalc-gateway:${Date.now().toString(36)}`,
          route: "helix_workstation_gateway_observation",
          engine: "unsupported",
          sourceOfTruth: "unsupported",
          capabilityClass: "arithmetic",
          artifactPath: null,
          delegatedTo: sourceCapability,
          warnings: ["panel_projection_from_gateway_observation"],
        },
      };
      scientificState.setSolveResult(projectedSolve, {
        actionId: "solve_expression",
        source: "workstation_action",
        calculatorSetup,
        compoundRunId,
        compoundSubgoalId,
        targetWorkbench,
      });
      dispatchScientificCalculatorMathPicked({
        latex: expression,
        sourcePath: sourceCapability,
        anchor: observationRef,
        source: "workstation_action",
      });
      useWorkstationSessionMemoryStore.getState().rememberDraft(SCIENTIFIC_CALCULATOR_DRAFT_KEY, expression);
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      const latestCalculatorState = useScientificCalculatorStore.getState();
      const calculatorReceipt = latestCalculatorState.lastCalculatorReceipt;
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "calculator_gateway_solve_projection",
          schema: "helix.calculator_gateway_solve_projection.v1",
          expression,
          normalized_expression: normalizedExpression,
          result_text: resultText,
          source_capability: sourceCapability,
          observation_ref: observationRef,
          history_id: historyEntry.id,
          gateway_observation_authority: true,
          panel_generated_answer: false,
          assistant_answer: false,
          terminal_eligible: false,
          produced_calculator_receipt: Boolean(calculatorReceipt),
          calculator_receipt: calculatorReceipt,
          calculator_receipt_ref: calculatorReceipt?.receipt_id ?? null,
          calculator_receipt_status: calculatorReceipt?.status ?? null,
          debug_event: latestCalculatorState.debugEvents[0] ?? null,
          debug_log_tail: buildScientificCalculatorDebugSnapshot(latestCalculatorState.debugEvents, 8),
        },
      };
    }

    if (actionId === "copy_result") {
      const resultText = scientificState.lastSolve?.result_text?.trim();
      if (!resultText) {
        const debugEvent = scientificState.recordDebugEvent({
          action_id: "copy_result",
          source: "workstation_action",
          ok: false,
          message: "No calculator result available to copy.",
        });
        return {
          ok: false,
          panel_id: panelId,
          action_id: actionId,
          message: "No calculator result available to copy.",
          artifact: {
            debug_event: debugEvent,
            debug_log_tail: buildScientificCalculatorDebugSnapshot(useScientificCalculatorStore.getState().debugEvents, 8),
          },
        };
      }
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(resultText).catch(() => undefined);
      }
      const debugEvent = scientificState.recordDebugEvent({
        action_id: "copy_result",
        source: "workstation_action",
        ok: true,
        input_latex: scientificState.lastSolve?.input_latex,
        result_text: resultText,
        normalized_expression: scientificState.lastSolve?.normalized_expression,
        trace_id: scientificState.lastSolve?.trace.traceId ?? null,
        route: scientificState.lastSolve?.trace.route ?? null,
        engine: scientificState.lastSolve?.trace.engine ?? null,
        message: "result_copied",
      });
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          copied: true,
          text: resultText,
          trace: scientificState.lastSolve?.trace ?? null,
          debug_event: debugEvent,
          debug_log_tail: buildScientificCalculatorDebugSnapshot(useScientificCalculatorStore.getState().debugEvents, 8),
        },
      };
    }

    if (actionId === "copy_debug_log") {
      const beforeCopy = useScientificCalculatorStore.getState().debugEvents;
      const debugText = formatScientificCalculatorDebugLog(beforeCopy);
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(debugText).catch(() => undefined);
      }
      const debugEvent = scientificState.recordDebugEvent({
        action_id: "copy_debug_log",
        source: "workstation_action",
        ok: true,
        message: "debug_log_copied",
      });
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          copied: true,
          text: debugText,
          debug_event: debugEvent,
          debug_log_tail: buildScientificCalculatorDebugSnapshot(useScientificCalculatorStore.getState().debugEvents, 8),
        },
      };
    }

    if (actionId === "clear_workspace") {
      scientificState.clear({ source: "workstation_action" });
      return {
        ok: true,
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          cleared: true,
          debug_event: useScientificCalculatorStore.getState().debugEvents[0] ?? null,
          debug_log_tail: buildScientificCalculatorDebugSnapshot(useScientificCalculatorStore.getState().debugEvents, 8),
        },
      };
    }

    if (
      actionId === "start_equation_live_source" ||
      actionId === "start_prime_stream" ||
      actionId === "restart_live_source" ||
      actionId === "stop_live_source" ||
      actionId === "emit_live_tick"
    ) {
      const liveSource = useScientificCalculatorLiveSourceStore.getState();
      const requestedEquation = asNonEmptyString(args.equation ?? args.latex ?? args.expression ?? args.text);
      const calculatorSetup = asCalculatorSetupContext(args.calculator_setup ?? args.setup_context ?? args.setup);
      const requestedEquationContext =
        asNonEmptyString(args.equation_context ?? args.equationContext ?? args.context) ??
        calculatorSetup?.subgoal ??
        null;
      const streamInput = {
        environmentId: asNonEmptyString(args.environment_id ?? args.environmentId),
        sourceId: asNonEmptyString(args.source_id ?? args.sourceId),
        tickRateMs: typeof args.tick_rate_ms === "number" ? args.tick_rate_ms : undefined,
        maxTicks: typeof args.max_ticks === "number" ? args.max_ticks : undefined,
        start: typeof args.start === "number" ? args.start : undefined,
      };
      if (actionId === "start_equation_live_source") {
        void liveSource.startEquationLiveSource({
          ...streamInput,
          equation: requestedEquation ? normalizeCalculatorActionLatex(requestedEquation) : undefined,
          equationContext: requestedEquationContext,
          calculatorSetup,
          mode: "current_equation",
        });
      } else if (actionId === "start_prime_stream") {
        void liveSource.startPrimeStream(streamInput);
      } else if (actionId === "restart_live_source") {
        void liveSource.restartPrimeStream();
      } else if (actionId === "stop_live_source") {
        liveSource.stopPrimeStream();
      } else {
        void liveSource.emitNextTick();
      }
      context.openPanel(panelId, undefined);
      context.focusPanel(panelId, undefined);
      const latestLiveSource = useScientificCalculatorLiveSourceStore.getState();
      const latestPayload =
        latestLiveSource.latestTick?.payload && typeof latestLiveSource.latestTick.payload === "object"
          ? latestLiveSource.latestTick.payload as Record<string, unknown>
          : null;
      return {
        ok: latestLiveSource.status !== "error",
        panel_id: panelId,
        action_id: actionId,
        artifact: {
          kind: "workstation_live_source_receipt",
          mode: actionId === "start_equation_live_source" ? "current_equation" : latestLiveSource.mode,
          source_id: latestLiveSource.sourceId || streamInput.sourceId || null,
          environment_id: latestLiveSource.environmentId || streamInput.environmentId || null,
          status: latestLiveSource.status,
          seq: latestLiveSource.mode === "current_equation" ? latestLiveSource.equationState.seq : latestLiveSource.state.seq,
          requested_equation: requestedEquation ? normalizeCalculatorActionLatex(requestedEquation) : null,
          source_equation: latestLiveSource.sourceEquation || (requestedEquation ? normalizeCalculatorActionLatex(requestedEquation) : null),
          equation_context: latestLiveSource.equationContext || requestedEquationContext || null,
          latest_result_text: typeof latestPayload?.result_text === "string" ? latestPayload.result_text : null,
          latest_tick: latestLiveSource.latestTick,
          live_workbench_expression: latestLiveSource.liveWorkbenchExpression,
          live_solve_steps: latestLiveSource.liveSolveSteps,
          active_live_step_id: latestLiveSource.activeLiveStepId,
          calculator_setup: latestLiveSource.calculatorSetup ?? calculatorSetup ?? null,
          result_unit: (latestLiveSource.calculatorSetup ?? calculatorSetup)?.result_unit ?? null,
          result_quantity: (latestLiveSource.calculatorSetup ?? calculatorSetup)?.result_quantity ?? (latestLiveSource.calculatorSetup ?? calculatorSetup)?.quantity ?? null,
          result_dimension: (latestLiveSource.calculatorSetup ?? calculatorSetup)?.result_dimension ?? null,
          result_dimension_signature: (latestLiveSource.calculatorSetup ?? calculatorSetup)?.result_dimension_signature ?? null,
          unit_system: (latestLiveSource.calculatorSetup ?? calculatorSetup)?.unit_system ?? null,
          input_units: (latestLiveSource.calculatorSetup ?? calculatorSetup)?.input_units ?? null,
          unit_options: (latestLiveSource.calculatorSetup ?? calculatorSetup)?.unit_options ?? [],
          assumptions: (latestLiveSource.calculatorSetup ?? calculatorSetup)?.assumptions ?? [],
          evidence_refs: latestLiveSource.latestTick
            ? [`calculator:live:${latestLiveSource.latestTick.trace.calculator_trace_id}`]
            : requestedEquation
              ? [`calculator:requested:${normalizeCalculatorActionLatex(requestedEquation)}`]
              : [],
          deterministic: true,
          model_invoked: false,
          context_role: "observation_not_assistant_answer",
          debug_log_tail: latestLiveSource.debugLog.slice(0, 12),
        },
      };
    }
  }

  if (!getPanelDef(panelId)) {
    return {
      ok: false,
      panel_id: panelId,
      action_id: actionId,
      message: `Unknown panel: ${panelId}`,
    };
  }

  return {
    ok: false,
    panel_id: panelId,
    action_id: actionId,
    message: `Action not supported for panel: ${panelId}.${actionId}`,
  };
}

export async function executeHelixPanelActionAsync(
  request: HelixPanelActionRequest,
  context: HelixPanelActionExecutionContext,
): Promise<HelixPanelActionExecutionResult> {
  const panelId = request.panel_id?.trim();
  const actionId = request.action_id?.trim().toLowerCase();
  if (
    (panelId === "image-lens" || panelId === "live-answer-environment" || panelId === "document-image-lens") &&
    actionId === "image_lens.focus_regions"
  ) {
    const result = await runImageLensFocusRun({
      request: request.args ?? {},
    });
    context.openPanel("image-lens", undefined);
    context.focusPanel("image-lens", undefined);
    const blocked = result.blockers.length > 0;
    return {
      ok: true,
      panel_id: panelId,
      action_id: actionId,
      artifact: {
        kind: "image_lens_focus_run_result",
        status: blocked ? "blocked" : "submitted",
        ...result,
        assistant_answer: false,
        terminal_eligible: false,
        context_role: "receipt_not_assistant_answer",
      },
      message: !blocked
        ? `Image Lens focus run submitted ${result.submittedRegions.length} crop region${result.submittedRegions.length === 1 ? "" : "s"}.`
        : `Image Lens focus run blocked: ${result.blockers.join("; ")}`,
    };
  }

  return executeHelixPanelAction(request, context);
}
