import type { HelixAskRouteMetadata } from "@/lib/helix/ask-prompt-launch";
import { asksForScientificImageTextEvidenceComparison } from "@shared/helix-scientific-image-intent";
import {
  isAffirmativeTheoryBadgeGraphReflectionPrompt,
  isTheoryBadgeGraphCurrentContextPrompt,
} from "@shared/helix-theory-badge-graph-intent";

export const HELIX_ASK_BACKEND_ENTRYPOINT_REQUIRED_ERROR_CODE = "backend_ask_entry_required";
export const HELIX_ASK_BACKEND_ENTRYPOINT_REQUIRED_TEXT =
  "This prompt requires the backend Ask solver path before a final answer can be shown.";
export const HELIX_ASK_ENTRYPOINT_GUARD_VERSION = "E81";

type HelixAskBackendEntrypointFamily =
  | "calculator"
  | "docs_viewer"
  | "narrator"
  | "workstation_notes"
  | "repo_code"
  | "moral_graph"
  | "theory_badge_graph"
  | "workspace_diagnostic"
  | "internet_search"
  | "scholarly_research"
  | "research_library"
  | "environment_connector"
  | "live_pipeline"
  | "helix_ask"
  | "visual_capture"
  | "image_lens"
  | "scientific_image"
  | "postulate";

type HelixAskBackendEntrypointFamilyResolution = {
  family: HelixAskBackendEntrypointFamily;
  sourceTarget: string;
  targetKind: string;
  requiredToolFamily: string;
  selectedCapability: string | null;
  explicitCue: string;
  requestedOutputs: string[];
};

const HELIX_EVIDENCE_GATE_HARD_CLAIM_RE =
  /\b(?:verify|verification|prove|proof|audit|compare|contrast|difference|tradeoff|synthesi[sz]e|explain|why|how|pass\/?fail|integrity|evidence|claim)\b/i;

const HELIX_EVIDENCE_GATE_TRANSFORM_TASK_RE =
  /^\s*(?:please\s+)?(?:translate|rewrite|rephrase|paraphrase|convert|render)\b/i;

const HELIX_ASK_COMPARE_TRIGGER_RE = /\b(?:compare|contrast|difference|diff|what changed|changed since)\b/i;

const HELIX_ASK_CAPABILITY_BEHAVIOR_TOOL_LABEL =
  "(?:research[-\\s]+library|research[-\\s]+papers?|scholarly(?:[-\\s]+research)?|scientific[-\\s]+calculator|calculator|docs?(?:[-\\s]+viewer)?|repo(?:[-\\s]+search)?|internet[-\\s]+search|moral[-\\s]+graph|theory[-\\s]+badge[-\\s]+graph|theory[-\\s]+graph|badge[-\\s]+graph|image[-\\s]+lens|visual[-\\s]+capture|workstation[-\\s]+notes?|notes?|workspace(?:[-\\s]+diagnostic)?|live[-\\s]+source|live[-\\s]+environment|narrator|voice|postulate(?:[-\\s]+board)?|helix[-\\s]+ask)";

const HELIX_ASK_CAPABILITY_BEHAVIOR_SUBJECT =
  `(?:(?:(?:the|this)\\s+)?${HELIX_ASK_CAPABILITY_BEHAVIOR_TOOL_LABEL}|(?:your|the|this)\\s+(?:${HELIX_ASK_CAPABILITY_BEHAVIOR_TOOL_LABEL}\\s+)?(?:tool|capability|workflow))`;

const HELIX_ASK_CAPABILITY_BEHAVIOR_QUESTION_RE = new RegExp(
  `\\b(?:does|do|can|could|how\\s+(?:does|do|can))\\s+${HELIX_ASK_CAPABILITY_BEHAVIOR_SUBJECT}\\b[\\s\\S]{0,260}\\b(?:allow|able|support|select|pick|choose|parse|open|openable|check|use|fallback|escalat|inspect|read|search|create|append|mutat|control|work|access|route|return)\\w*\\b`,
  "i",
);

const HELIX_ASK_BACKEND_ENTRYPOINT_REQUIRED_PROMPT_RE =
  /(?:^|\s)\/postulate\b|\b(?:postulate\.submit_proposal|scientific-calculator\.[a-z0-9_.-]+|scientific\s+calculator|calculator_receipt|calculator\s+tool|docs-viewer\.[a-z0-9_.-]+|docs\.search|docs\s+viewer|docs\s+search|narrator\.[a-z0-9_.-]+|panel[_\s-]?id\s*(?:=|:)\s*narrator|workstation-notes\.create_note|workstation-notes\.create|repo-code\.[a-z0-9_.-]+|repo_code\.[a-z0-9_.-]+|repo\.search|repo\s+search|moral-graph\.[a-z0-9_.-]+|(?:use|with|through|via)\s+(?:only\s+)?(?:the\s+)?moral\s+graph\b[\s\S]{0,120}\b(?:reflect|reflection|case|situation|dependency|repair|boundary|agency|badge|lens)|workspace-directory\.[a-z0-9_.-]+|workspace_directory\.[a-z0-9_.-]+|workspace_os\.status|internet_search\.[a-z0-9_.-]+|internet\s+search\s+tool|scholarly-research\.[a-z0-9_.-]+|scholarly_research\.[a-z0-9_.-]+|scholarly\s+research\s+tool|lookup_papers|fetch_full_text|extract_numeric_parameters|research-library\.[a-z0-9_.-]+|research_library\.[a-z0-9_.-]+|live_env\.[a-z0-9_.-]+|helix_ask\.(?!reflect_theory_context\b)[a-z0-9_.-]+|image[_\s-]?lens|visual_analysis\.inspect_image_region|visual_capture|scientific\s+(?:document|image|page)|document\s+image|attached\s+image.*(?:equation|latex|theory\s+graph))\b/i;

const HELIX_ASK_NOTE_CREATE_NEGATED_OR_CONTEXTUAL_RE =
  /\b(?:don't|do\s+not|dont|never|no\s+need\s+to|without|avoid|stop|cancel|should\s+i|would\s+it|could\s+it|when\s+i|when\s+you|if\s+i|if\s+you|before\s+i|after\s+i|last\s+time|previously|earlier|failed|failure|debug|quote|quoted|says?|said|screen\s+shows?)\b[\s\S]{0,120}\b(?:write|make|create|save|take|add)\s+(?:me\s+)?(?:a\s+|the\s+|new\s+)?note\b/i;

const HELIX_ASK_NOTE_CREATE_COMMAND_RE =
  /^\s*(?:(?:please|pls|hey\s+helix|helix|can\s+you|could\s+you|would\s+you|will\s+you|i\s+need\s+you\s+to|i\s+want\s+you\s+to)\s+)?(?:write|make|create|save|take|add)\s+(?:me\s+)?(?:a\s+|the\s+|new\s+)?note\b/i;

const HELIX_ASK_MINECRAFT_ENVIRONMENT_CONTEXT_RE =
  /\b(?:minecraft|fabric\s+(?:server|world|environment|source|mod)|paper\s+(?:server|world|environment|source|plugin)|paired\s+(?:game|world|environment|source)|selected\s+(?:minecraft\s+)?player|stone[-\s]?bricks?|overworld|nether|end\s+portal|spreadplayers|helixgame|rollback\s+checkpoint)\b/i;

const HELIX_ASK_MINECRAFT_CONTEXTUAL_ONLY_RE =
  /^\s*(?:do\s+not|don't|dont|never|without|avoid|stop|cancel|next\s+time|later|in\s+the\s+future|if\b|when\b|before\b|after\b|previously|earlier|last\s+time|why\s+did|what\s+is|what\s+does|how\s+does|explain|describe|define|could\s+the|would\s+the|can\s+the|the\s+(?:screen|button|message|prompt|debug|trace)\s+(?:says?|shows?|mentions?))\b/i;

const HELIX_ASK_MINECRAFT_AFFIRMATIVE_OPERATION_RE =
  /^\s*(?:(?:please|pls|hey\s+helix|helix|can\s+you|could\s+you|would\s+you|will\s+you|i\s+need\s+you\s+to|i\s+want\s+you\s+to)\s+)?(?:using\b[\s\S]{0,180}\b)?(?:move|relocate|teleport|spread|build|construct|place|set|fill|summon|ignite|light|extinguish|give|clear|kill|apply|arm|restore|capture|discard|run|execute|use|check|inspect|read|show|find|locate|report)\b|^\s*(?:at|around|near)\b[\s\S]{0,180}\b(?:move|relocate|teleport|build|construct|place|set|fill|summon|ignite|light|extinguish|check|inspect|read|find|locate)\b|^\s*continue\b[\s\S]{0,220}\b(?:move|relocate|teleport|build|construct|place|set|fill|summon|ignite|light|extinguish|check|inspect|read|find|locate|restore|capture)\b/i;

const HELIX_ASK_MINECRAFT_AFFIRMATIVE_MUTATION_RE =
  /^\s*(?:(?:please|pls|hey\s+helix|helix|can\s+you|could\s+you|would\s+you|will\s+you|i\s+need\s+you\s+to|i\s+want\s+you\s+to)\s+)?(?:using\b[\s\S]{0,180}\b)?(?:move|relocate|teleport|spread|build|construct|place|set|fill|summon|ignite|light|extinguish|give|clear|kill|apply|arm|restore|capture|discard|run|execute|use)\b|^\s*(?:at|around|near)\b[\s\S]{0,180}\b(?:move|relocate|teleport|build|construct|place|set|fill|summon|ignite|light|extinguish|restore|capture)\b|^\s*continue\b[\s\S]{0,220}\b(?:move|relocate|teleport|build|construct|place|set|fill|summon|ignite|light|extinguish|restore|capture|discard)\b/i;

function isAffirmativeMinecraftEnvironmentPrompt(question: string): boolean {
  const normalized = question.trim();
  if (!normalized || !HELIX_ASK_MINECRAFT_ENVIRONMENT_CONTEXT_RE.test(normalized)) return false;
  if (HELIX_ASK_MINECRAFT_CONTEXTUAL_ONLY_RE.test(normalized)) return false;
  if (/^\s*(?:the\s+phrase|the\s+command|the\s+request)\s+["'`]/i.test(normalized)) return false;
  return (
    HELIX_ASK_MINECRAFT_AFFIRMATIVE_OPERATION_RE.test(normalized) ||
    /^\s*(?:use|run|execute)\b[\s\S]{0,160}\bcom\.casimirbot\.minecraft\.[a-z0-9_.-]+\b/i.test(normalized)
  );
}

function isExplicitWorkstationNoteCreatePrompt(question: string): boolean {
  const normalized = question.trim();
  if (!normalized) return false;
  if (HELIX_ASK_NOTE_CREATE_NEGATED_OR_CONTEXTUAL_RE.test(normalized)) return false;
  if (/\bworkstation-notes\.create(?:_note)?\b/i.test(normalized)) return true;
  return HELIX_ASK_NOTE_CREATE_COMMAND_RE.test(normalized);
}

const HELIX_ASK_SCIENTIFIC_IMAGE_PROMPT_RE =
  /\b(?:attached\s+image|image|screenshot|document\s+image|scientific\s+(?:document|image|page|paper))\b[\s\S]{0,180}\b(?:equations?|latex|symbols?|scientific\s+text|theory\s+(?:badge\s+)?graph|compare|congruence|reflection)\b/i;

const HELIX_ASK_SCIENTIFIC_IMAGE_FOLLOWUP_RE =
  /\b(?:promoted|exact(?:\s+row)?|page(?:-|\s+)?grounded|page|scientific|image\s+lens|sidecar|crop|ocr|math)\b[\s\S]{0,160}\b(?:equation|latex|scientific\s+evidence|evidence\s+packet|evidence)\b[\s\S]{0,220}\b(?:reflect|reflection|theory\s+(?:badge\s+)?graph|badge\s+graph|calculator\s+payload|payload\s+admissibility|payload\s+filter|branch\s+admission)\b/i;

const HELIX_ASK_SCIENTIFIC_IMAGE_EVIDENCE_REF_REVISION_RE =
  /\b(?:revise|update|convert|draft|postulate\s+board|evidence\s+refs?)\b[\s\S]{0,220}\b(?:promoted|page(?:-|\s+)?grounded|exact(?:\s+row)?|equation\s+row|crop\s+ref|image\s+lens|source(?:\/hash|\s+hash)?|evidence\s+depth)\b/i;

const HELIX_ASK_SCIENTIFIC_IMAGE_CONTINUITY_AUDIT_RE =
  /\b(?:continuity\s+audit|evidence\s+continuity|latest\s+scientific\s+image\s+lens\s+sidecar|latest\s+scientific\s+image\s+sidecar|prior\s+scientific\s+image\s+evidence\s+chain)\b[\s\S]{0,260}\b(?:evidence\s+depth|sidecar\s+id|image\s+lens\s+source|source\s+image\s+hash|crop\s+ref|promoted\s+equation|active\s+promoted\s+row\s+blockers|historical\s+non-promoted\s+row\s+blockers|graph\s+reflection\s+refs?|postulate\s+evidence\s+refs?)\b/i;

const HELIX_ASK_IMAGE_LENS_NAMED_RECEIPT_EVALUATION_RE =
  /\b(?:use|evaluate|report|promote|treat|from)\b[\s\S]{0,160}\b(?:image\s+lens\s+)?(?:observation\s+)?receipt\s+(?:named|called)?\s*`?(?:crop_\d+|equation_\d+)`?\b/i;

const HELIX_ASK_SCIENTIFIC_IMAGE_REFLECTION_PROMPT_RE =
  /\b(?:compare|congruence|reflect|reflection|theory\s+(?:badge\s+)?graph|badge\s+graph|calculator(?:\s+payload|\s+handoff)?|payload\s+filter|branch\s+admission|admit\s+(?:a\s+)?branch)\b/i;

const stripQuotedPayloadsForBackendEntrypointPolicy = (text: string): string =>
  text
    .replace(/"[\s\S]*?"/g, " quoted payload ")
    .replace(/'[\s\S]*?'/g, " quoted payload ");

export const isConceptualToolExplanationWithoutExecution = (question: string): boolean => {
  const normalized = question.trim();
  if (!normalized) return false;
  if (HELIX_ASK_CAPABILITY_BEHAVIOR_QUESTION_RE.test(normalized)) return true;
  const asksForConcept =
    /\b(?:what\s+is|what\s+does|explain|describe|define|meaning\s+of|looks?\s+like)\b/i.test(normalized);
  const referencesToolOrCapability =
    /\b(?:tool|capability|identifier|namespace|function|action|moral\s+graph\s+reflection|moral\s+graph\s+tool|theory\s+badge\s+graph|theory\s+graph|badge\s+graph|helix_ask\.reflect_theory_context|theory-badge-graph\.reflect_discussion_context|internet[-_.\s]?search|scientific\s+calculator|image\s+lens|docs\s+viewer|repo\.search|scholarly[-_.\s]?research|research[-_.\s]?library)\b/i.test(normalized);
  const suppressesExecution =
    /\b(?:do\s+not|don't|dont|without|not\s+to|no\s+need\s+to)\b[\s\S]{0,80}\b(?:run|execute|call|use|browse|search|open|inspect|reflect)\b/i.test(normalized) ||
    /\b(?:conceptually|plain\s+english|just\s+explain|only\s+explain)\b/i.test(normalized);
  const affirmativeExecution =
    /\b(?:use|run|execute|call|open|search|browse|inspect|reflect\s+on|reflect\s+with|through|via)\s+(?:only\s+)?(?:the\s+)?(?:moral\s+graph|theory\s+badge\s+graph|theory\s+graph|badge\s+graph|helix_ask\.reflect_theory_context|theory-badge-graph\.reflect_discussion_context|scientific\s+calculator|image\s+lens|docs\s+viewer|repo\.search|internet\s+search|scholarly\s+research|research\s+library)\b/i.test(normalized);
  return asksForConcept && referencesToolOrCapability && suppressesExecution && !affirmativeExecution;
};

const isQuotedTransformOnlyForBackendEntrypointPolicy = (question: string): boolean => {
  if (!HELIX_EVIDENCE_GATE_TRANSFORM_TASK_RE.test(question)) return false;
  if (!/"[\s\S]+"/.test(question) && !/'[\s\S]+'/.test(question)) return false;
  const instructionText = stripQuotedPayloadsForBackendEntrypointPolicy(question);
  return (
    !HELIX_EVIDENCE_GATE_HARD_CLAIM_RE.test(instructionText) &&
    !HELIX_ASK_COMPARE_TRIGGER_RE.test(instructionText)
  );
};

const normalizeCapability = (value: string): string => value.replace(/^scholarly_research\./i, "scholarly-research.");

export function resolveHelixAskBackendEntrypointFamily(
  value: string,
): HelixAskBackendEntrypointFamilyResolution | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (isQuotedTransformOnlyForBackendEntrypointPolicy(normalized)) return null;
  if (isConceptualToolExplanationWithoutExecution(normalized)) return null;
  if (/(?:^|\s)\/postulate\b|\bpostulate\.submit_proposal\b/i.test(normalized)) {
    return {
      family: "postulate",
      sourceTarget: "postulate_board",
      targetKind: "postulate_runtime_review",
      requiredToolFamily: "postulate",
      selectedCapability: null,
      explicitCue: "/postulate",
      requestedOutputs: [
        "postulate_runtime_review",
        "postulate_submission_gate",
        "postulate_submit_receipt",
        "revision_recovery_plan",
        "typed_failure",
      ],
    };
  }
  if (/\b(?:scientific-calculator\.solve_expression|scientific-calculator\.solve_with_steps|scientific\s+calculator|calculator_receipt|calculator\s+tool)\b/i.test(normalized)) {
    return {
      family: "calculator",
      sourceTarget: "calculator_stream",
      targetKind: "calculator_stream",
      requiredToolFamily: "calculator",
      selectedCapability: /\bscientific-calculator\.solve_with_steps\b/i.test(normalized)
        ? "scientific-calculator.solve_with_steps"
        : "scientific-calculator.solve_expression",
      explicitCue: "scientific_calculator_solve",
      requestedOutputs: ["tool_call_eligibility", "calculator_receipt", "typed_failure"],
    };
  }
  if (/\b(?:docs-viewer\.[a-z0-9_.-]+|docs\.search|docs\s+viewer|docs\s+search)\b/i.test(normalized)) {
    const capability =
      normalized.match(/\bdocs-viewer\.[a-z0-9_.-]+\b/i)?.[0] ??
      (/\b(?:docs\.search|docs\s+search)\b/i.test(normalized) ? "docs.search" : null);
    return {
      family: "docs_viewer",
      sourceTarget: "docs_viewer",
      targetKind: "docs_viewer",
      requiredToolFamily: "docs_viewer",
      selectedCapability: capability,
      explicitCue: "docs_viewer_tool_family",
      requestedOutputs: ["tool_call_eligibility", "doc_evidence", "typed_failure"],
    };
  }
  if (/\b(?:narrator\.[a-z0-9_.-]+|panel[_\s-]?id\s*(?:=|:)\s*narrator)\b/i.test(normalized)) {
    const explicitAction = normalized.match(/\baction[_\s-]?id\s*(?:=|:)\s*(narrator\.[a-z0-9_.-]+)\b/i)?.[1] ?? null;
    const capability = explicitAction ?? normalized.match(/\bnarrator\.[a-z0-9_.-]+\b/i)?.[0] ?? null;
    return {
      family: "narrator",
      sourceTarget: "workstation_panel",
      targetKind: "workstation_state",
      requiredToolFamily: "narrator",
      selectedCapability: capability,
      explicitCue: "narrator_tool_family",
      requestedOutputs: ["tool_call_eligibility", "workspace_action_receipt", "voice_debug_receipt", "typed_failure"],
    };
  }
  if (isExplicitWorkstationNoteCreatePrompt(normalized)) {
    return {
      family: "workstation_notes",
      sourceTarget: "workstation_panel",
      targetKind: "workstation_state",
      requiredToolFamily: "workstation-notes",
      selectedCapability: "workstation-notes.create_note",
      explicitCue: "explicit_workstation_note_create",
      requestedOutputs: ["tool_call_eligibility", "workspace_action_receipt", "note_update_receipt", "typed_failure"],
    };
  }
  if (/\b(?:repo-code\.[a-z0-9_.-]+|repo_code\.[a-z0-9_.-]+|repo\.search|repo\s+search)\b/i.test(normalized)) {
    const capability =
      normalized.match(/\b(?:repo-code|repo_code)\.[a-z0-9_.-]+\b/i)?.[0]?.replace(/^repo_code\./i, "repo-code.") ??
      (/\b(?:repo\.search|repo\s+search)\b/i.test(normalized) ? "repo.search" : null);
    return {
      family: "repo_code",
      sourceTarget: "repo_code",
      targetKind: "repo_code",
      requiredToolFamily: "repo_code",
      selectedCapability: capability,
      explicitCue: "repo_code_tool_family",
      requestedOutputs: ["tool_call_eligibility", "repo_code", "line_backed_source", "typed_failure"],
    };
  }
  if (
    /\bmoral-graph\.[a-z0-9_.-]+\b/i.test(normalized) ||
    /\b(?:use|with|through|via)\s+(?:only\s+)?(?:the\s+)?moral\s+graph\b[\s\S]{0,120}\b(?:reflect|reflection|case|situation|dependency|repair|boundary|agency|badge|lens)\b/i.test(normalized)
  ) {
    const capability =
      normalized.match(/\bmoral-graph\.[a-z0-9_.-]+\b/i)?.[0] ??
      "moral-graph.reflect_context";
    return {
      family: "moral_graph",
      sourceTarget: "moral_graph",
      targetKind: capability === "moral-graph.reflect_living_substrate_context"
        ? "moral_living_substrate_reflection"
        : "moral_graph_reflection",
      requiredToolFamily: "moral_graph",
      selectedCapability: capability,
      explicitCue: "moral_graph_tool_family",
      requestedOutputs: ["tool_call_eligibility", "moral_graph_observation", "diagnostic_reflection", "typed_failure"],
    };
  }
  if (/\b(?:workspace-directory\.[a-z0-9_.-]+|workspace_directory\.[a-z0-9_.-]+|workspace_os\.status)\b/i.test(normalized)) {
    const rawCapability = normalized.match(/\b(?:workspace-directory|workspace_directory|workspace_os)\.[a-z0-9_.-]+\b/i)?.[0] ?? null;
    return {
      family: "workspace_diagnostic",
      sourceTarget: "workspace_diagnostic",
      targetKind: "workspace_diagnostic",
      requiredToolFamily: rawCapability?.startsWith("workspace_os.") ? "workspace_os" : "workspace_directory",
      selectedCapability: rawCapability?.replace(/^workspace_directory\./i, "workspace-directory.") ?? null,
      explicitCue: "workspace_diagnostic_tool_family",
      requestedOutputs: ["tool_call_eligibility", "workspace_observation", "typed_failure"],
    };
  }
  if (/\b(?:internet_search\.[a-z0-9_.-]+|internet\s+search\s+tool)\b/i.test(normalized)) {
    const capability = normalized.match(/\binternet_search\.[a-z0-9_.-]+\b/i)?.[0] ?? "internet_search.web_research";
    return {
      family: "internet_search",
      sourceTarget: "internet_search",
      targetKind: "internet_search",
      requiredToolFamily: "internet_search",
      selectedCapability: capability,
      explicitCue: "internet_search_tool_family",
      requestedOutputs: ["tool_call_eligibility", "web_research_observation", "typed_failure"],
    };
  }
  if (/\b(?:scholarly-research\.[a-z0-9_.-]+|scholarly_research\.[a-z0-9_.-]+|scholarly\s+research\s+tool|lookup_papers|fetch_full_text|extract_numeric_parameters)\b/i.test(normalized)) {
    const rawCapability =
      normalized.match(/\b(?:scholarly-research|scholarly_research)\.[a-z0-9_.-]+\b/i)?.[0] ??
      (/\bextract_numeric_parameters\b/i.test(normalized)
        ? "scholarly-research.extract_numeric_parameters"
        : /\bfetch_full_text\b/i.test(normalized)
          ? "scholarly-research.fetch_full_text"
          : "scholarly-research.lookup_papers");
    return {
      family: "scholarly_research",
      sourceTarget: "scholarly_research",
      targetKind: "scholarly_research",
      requiredToolFamily: "scholarly_research",
      selectedCapability: normalizeCapability(rawCapability),
      explicitCue: "scholarly_research_tool_family",
      requestedOutputs: ["tool_call_eligibility", "scholarly_paper_evidence", "full_text_observation", "numeric_parameter_observation", "typed_failure"],
    };
  }
  if (/\b(?:research-library|research_library)\.[a-z0-9_.-]+\b/i.test(normalized)) {
    const explicitCapability = normalized
      .match(/\b(?:research-library|research_library)\.[a-z0-9_.-]+\b/i)?.[0]
      ?.replace(/^research_library\./i, "research-library.") ?? null;
    const requestsEnrichment = explicitCapability === "research-library.apply_evidence_enrichment";
    const requestsBoundedReadFirst = requestsEnrichment &&
      /\b(?:read|inspect|using|use|from)\b[\s\S]{0,180}\b(?:saved\s+)?research\s+library\s+(?:document|paper|pdf|sidecar|evidence)\b/i.test(normalized);
    const selectedCapability = requestsBoundedReadFirst
      ? "research-library.read_document"
      : explicitCapability;
    return {
      family: "research_library",
      sourceTarget: "research_library",
      targetKind: requestsEnrichment ? "saved_paper_evidence_enrichment" : "saved_scholarly_full_text",
      requiredToolFamily: "research_library",
      selectedCapability,
      explicitCue: requestsBoundedReadFirst
        ? "research_library_read_then_enrich"
        : "research_library_tool_family",
      requestedOutputs: requestsEnrichment
        ? [
            "tool_call_eligibility",
            "research_library_observation",
            "paper_evidence_enrichment_observation",
            "calculator_prefill",
            "model_authored_synthesis",
            "typed_failure",
          ]
        : ["tool_call_eligibility", "research_library_observation", "model_authored_synthesis", "typed_failure"],
    };
  }
  const requestsCurrentTheoryBadgeGraphContext = isTheoryBadgeGraphCurrentContextPrompt(normalized);
  const requestsTheoryBadgeGraphReflection = isAffirmativeTheoryBadgeGraphReflectionPrompt(normalized);
  if (requestsCurrentTheoryBadgeGraphContext || requestsTheoryBadgeGraphReflection) {
    const selectedCapability = requestsCurrentTheoryBadgeGraphContext
      ? "theory-badge-graph.current_context"
      : "helix_ask.reflect_theory_context";
    return {
      family: "theory_badge_graph",
      sourceTarget: "theory_locator",
      targetKind: requestsCurrentTheoryBadgeGraphContext
        ? "theory_badge_graph_current_context"
        : "theory_locator",
      requiredToolFamily: "theory_locator",
      selectedCapability,
      explicitCue: requestsCurrentTheoryBadgeGraphContext
        ? "current_theory_badge_graph_selection"
        : "affirmative_theory_badge_graph_reflection",
      requestedOutputs: [
        "tool_call_eligibility",
        ...(requestsCurrentTheoryBadgeGraphContext
          ? ["theory_badge_graph_current_context_observation"]
          : ["theory_context_reflection_observation"]),
        "model_authored_synthesis",
        "typed_failure",
      ],
    };
  }
  if (isAffirmativeMinecraftEnvironmentPrompt(normalized)) {
    const explicitCapability =
      normalized.match(/\bcom\.casimirbot\.minecraft\.[a-z0-9_.-]+\b/i)?.[0] ?? null;
    const requestsMutation = HELIX_ASK_MINECRAFT_AFFIRMATIVE_MUTATION_RE.test(normalized);
    const selectedCapability = explicitCapability ?? (
      requestsMutation ? "com.casimirbot.minecraft.command" : null
    );
    return {
      family: "environment_connector",
      sourceTarget: "live_environment",
      targetKind: "minecraft_environment",
      requiredToolFamily: "environment_connector",
      selectedCapability,
      explicitCue: requestsMutation
        ? "affirmative_minecraft_environment_operation"
        : "affirmative_minecraft_environment_read",
      requestedOutputs: [
        "tool_call_eligibility",
        "live_environment_observation",
        ...(requestsMutation
          ? ["environment_command_receipt", "post_action_observation", "rollback_receipt"]
          : []),
        "model_authored_synthesis",
        "typed_failure",
      ],
    };
  }
  if (/\blive_env\.[a-z0-9_.-]+\b/i.test(normalized)) {
    const capability = normalized.match(/\blive_env\.[a-z0-9_.-]+\b/i)?.[0] ?? null;
    return {
      family: "live_pipeline",
      sourceTarget: "live_pipeline",
      targetKind: "live_pipeline",
      requiredToolFamily: "live_env",
      selectedCapability: capability,
      explicitCue: "live_env_tool_family",
      requestedOutputs: ["tool_call_eligibility", "live_source_observation", "typed_failure"],
    };
  }
  if (/\bhelix_ask\.(?!reflect_theory_context\b)[a-z0-9_.-]+\b/i.test(normalized)) {
    const capability = normalized.match(/\bhelix_ask\.[a-z0-9_.-]+\b/i)?.[0] ?? null;
    return {
      family: "helix_ask",
      sourceTarget: "procedure_memory",
      targetKind: "procedure_memory",
      requiredToolFamily: "helix_ask",
      selectedCapability: capability,
      explicitCue: "helix_ask_tool_family",
      requestedOutputs: ["tool_call_eligibility", "procedure_observation", "typed_failure"],
    };
  }
  if (
    HELIX_ASK_IMAGE_LENS_NAMED_RECEIPT_EVALUATION_RE.test(normalized)
  ) {
    return {
      family: "scientific_image",
      sourceTarget: "scientific_image_evidence",
      targetKind: "scientific_image_named_receipt",
      requiredToolFamily: "visual_analysis",
      selectedCapability: null,
      explicitCue: "image_lens_named_observation_receipt",
      requestedOutputs: [
        "image_lens_named_receipt_evaluation",
        "typed_failure",
      ],
    };
  }
  if (asksForScientificImageTextEvidenceComparison(normalized)) {
    return {
      family: "scientific_image",
      sourceTarget: "scientific_image_evidence",
      targetKind: "scientific_image_evidence_sidecar",
      requiredToolFamily: "visual_analysis",
      selectedCapability: null,
      explicitCue: "affirmative_scientific_image_text_comparison",
      requestedOutputs: [
        "scientific_evidence_sidecar",
        "machine_text_visual_comparison",
        "model_authored_synthesis",
        "typed_failure",
      ],
    };
  }
  if (
    HELIX_ASK_SCIENTIFIC_IMAGE_PROMPT_RE.test(normalized) ||
    HELIX_ASK_SCIENTIFIC_IMAGE_FOLLOWUP_RE.test(normalized) ||
    HELIX_ASK_SCIENTIFIC_IMAGE_EVIDENCE_REF_REVISION_RE.test(normalized) ||
    HELIX_ASK_SCIENTIFIC_IMAGE_CONTINUITY_AUDIT_RE.test(normalized)
  ) {
    const requestedOutputs = [
      "tool_call_eligibility",
      "image_lens_crop_observation",
      "scientific_evidence_packet",
      "scientific_evidence_sidecar",
      ...(HELIX_ASK_SCIENTIFIC_IMAGE_CONTINUITY_AUDIT_RE.test(normalized)
        ? ["scientific_image_evidence_continuity_audit", "latest_scientific_image_sidecar_ref"]
        : []),
      ...(HELIX_ASK_SCIENTIFIC_IMAGE_REFLECTION_PROMPT_RE.test(normalized)
        ? ["theory_reflection", "calculator_payload_filter"]
        : []),
      "typed_failure",
    ];
    return {
      family: "scientific_image",
      sourceTarget: "scientific_image_evidence",
      targetKind: "scientific_image_evidence_sidecar",
      requiredToolFamily: "visual_analysis",
      selectedCapability: "visual_analysis.inspect_image_region",
      explicitCue: "scientific_image_evidence_sidecar",
      requestedOutputs,
    };
  }
  if (/\b(?:image[_\s-]?lens|visual_analysis\.inspect_image_region)\b/i.test(normalized)) {
    return {
      family: "image_lens",
      sourceTarget: "image_lens",
      targetKind: "visual_region_evidence",
      requiredToolFamily: "visual_analysis",
      selectedCapability: "visual_analysis.inspect_image_region",
      explicitCue: "image_lens_region_inspection",
      requestedOutputs: ["tool_call_eligibility", "image_lens_crop_observation", "scientific_evidence_packet", "typed_failure"],
    };
  }
  if (/\bvisual_capture\b/i.test(normalized)) {
    return {
      family: "visual_capture",
      sourceTarget: "visual_capture",
      targetKind: "visual_capture",
      requiredToolFamily: "visual_capture",
      selectedCapability: "visual_capture.inspect",
      explicitCue: "visual_capture_tool_family",
      requestedOutputs: ["tool_call_eligibility", "visual_frame_evidence", "typed_failure"],
    };
  }
  return null;
}

export function requiresHelixAskBackendEntrypoint(question: string | null | undefined): boolean {
  const normalized = `${question ?? ""}`.trim();
  if (!normalized) return false;
  if (isQuotedTransformOnlyForBackendEntrypointPolicy(normalized)) return false;
  if (isConceptualToolExplanationWithoutExecution(normalized)) return false;
  return HELIX_ASK_BACKEND_ENTRYPOINT_REQUIRED_PROMPT_RE.test(normalized) || Boolean(resolveHelixAskBackendEntrypointFamily(normalized));
}

export function shouldUseHelixAskBackendTurnEntrypoint(args: {
  manualCanaryEnabled: boolean;
  hardBackendEntrypointRequired: boolean;
}): boolean {
  return args.manualCanaryEnabled || args.hardBackendEntrypointRequired;
}

export function buildHelixAskPastedTextResumeRecallRouteMetadata(args: {
  base?: HelixAskRouteMetadata;
  turnId: string;
  threadId: string;
}): HelixAskRouteMetadata {
  return {
    ...(args.base ?? {}),
    schema: "helix.ask.route_metadata.v1",
    source: "conversation_memory_recall",
    sourceTarget: "conversation_memory",
    source_target_intent: {
      schema: "helix.ask_source_target_intent.v1",
      turn_id: args.turnId,
      thread_id: args.threadId,
      target_source: "conversation_memory",
      target_kind: "conversation_memory",
      strength: "hard",
      explicit_cues: ["pasted_text_resume_recall"],
      reasons: ["pasted_text_resume_recall_prompt"],
      requested_outputs: ["conversation_memory_answer"],
      suppressed_routes: ["conversation:simple", "model_only_concept", "workspace_diagnostic"],
      precedence_reason: "pasted_text_resume_recall_selected",
      must_enter_backend_ask: true,
      allow_client_shortcut: false,
      allow_no_tool_direct: false,
      confidence: 0.96,
      assistant_answer: false,
      raw_content_included: false,
    },
  };
}

export function buildHelixAskHardBackendEntrypointRouteMetadata(args: {
  question: string;
  base?: HelixAskRouteMetadata;
  turnId: string;
  threadId: string;
}): HelixAskRouteMetadata | null {
  const family = resolveHelixAskBackendEntrypointFamily(args.question);
  if (!family) return null;
  const sourceTargetIntent = {
    schema: "helix.ask_source_target_intent.v1",
    turn_id: args.turnId,
    thread_id: args.threadId,
    target_source: family.sourceTarget,
    target_kind: family.targetKind,
    strength: "hard",
    explicit_cues: [family.explicitCue],
    reasons: ["hard_tool_family_prompt", `${family.family}_backend_entrypoint_required`],
    requested_outputs: Array.from(new Set(family.requestedOutputs)),
    suppressed_routes: [
      "conversation:simple",
      "durable_chat_session",
      "client_projection",
      "evidence_finalization_fallback",
      "model_only_concept",
      "no_tool_direct",
    ],
    precedence_reason: "hard_tool_family_backend_entrypoint_required",
    must_enter_backend_ask: true,
    allow_client_shortcut: false,
    allow_no_tool_direct: false,
    confidence: 0.97,
    assistant_answer: false,
    raw_content_included: false,
  };
  const mandatoryNextTool = family.selectedCapability
    ? {
        schema: "helix.mandatory_next_tool.v1",
        phase: "tool_observation",
        tool_name: family.selectedCapability,
        required_tool_family: family.requiredToolFamily,
        selected_capability: family.selectedCapability,
        terminal_forbidden: true,
        reason: "hard tool-family prompt requires backend Ask capability observation before terminal authority",
        missing_required_evidence: family.requestedOutputs.includes("scientific_evidence_sidecar")
          ? "scientific_evidence_sidecar"
          : family.requestedOutputs.includes("calculator_receipt")
          ? "calculator_receipt"
          : "tool_observation",
        blocking_reasons: ["backend_ask_entry_required", "tool_observation_required"],
        canonical_goal: family.family,
        assistant_answer: false,
        raw_content_included: false,
      }
    : undefined;
  return {
    ...(args.base ?? {}),
    schema: "helix.ask.route_metadata.v1",
    source: "hard_tool_backend_entrypoint",
    sourceTarget: family.sourceTarget,
    requiredToolFamily: family.requiredToolFamily,
    source_target_intent: {
      ...(args.base?.source_target_intent ?? {}),
      ...sourceTargetIntent,
    },
    ...(mandatoryNextTool ? { mandatory_next_tool: mandatoryNextTool } : {}),
  };
}
