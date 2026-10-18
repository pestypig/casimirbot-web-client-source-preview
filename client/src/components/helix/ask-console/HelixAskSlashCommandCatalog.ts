import {
  HELIX_USER_ACCOUNT_POLICY,
  HELIX_USER_WORKSTATION_PANEL_IDS,
  resolveHelixAccountPanelAccess,
  resolveHelixWorkstationCapabilityAccess,
  type HelixAccountCapabilityPolicy,
  type HelixAccountPolicyAccessState,
  type HelixWorkstationPermissionProfile,
} from "@shared/helix-account-session";
import type { InterfaceMessageId, InterfaceMessageValues } from "@/lib/i18n/messages/types";

export type HelixAskSlashCommandRuntime = {
  id: string;
  label: string;
};

export type HelixAskSlashCommandCatalogItem = {
  id: string;
  command: string;
  label: string;
  labelMessageId?: InterfaceMessageId;
  capabilityId: string;
  expectedTerminalProductKind?: string;
  allowedTerminalProductKinds?: string[];
  description: string;
  descriptionMessageId?: InterfaceMessageId;
  insertionText: string;
  insertionTextMessageId?: InterfaceMessageId;
  permissionRequired?: HelixWorkstationPermissionProfile;
  fallbackPanelId?: string;
  runtimeIds?: string[];
  developerOnly?: boolean;
  generated?: boolean;
};

export type HelixAskSlashCommandMenuItem = HelixAskSlashCommandCatalogItem & {
  accessState: HelixAccountPolicyAccessState;
  accessReason: string | null;
  runtimeAvailable: boolean;
  runtimeLabel: string | null;
};

export type HelixAskSlashCommandTranslate = (
  id: InterfaceMessageId,
  values?: InterfaceMessageValues,
) => string;

const HELIX_ASK_SLASH_COMMAND_CATALOG: HelixAskSlashCommandCatalogItem[] = [
  {
    id: "calculator",
    command: "/calculator",
    label: "Calculator",
    labelMessageId: "helixAsk.slash.calculator.label",
    capabilityId: "scientific-calculator.solve_expression",
    expectedTerminalProductKind: "workstation_tool_evaluation",
    allowedTerminalProductKinds: ["workstation_tool_evaluation", "typed_failure"],
    description: "Solve or inspect a mathematical expression with the workstation calculator.",
    descriptionMessageId: "helixAsk.slash.calculator.description",
    insertionText: "Use the scientific calculator capability to ",
    insertionTextMessageId: "helixAsk.slash.calculator.insertion",
    permissionRequired: "act",
  },
  {
    id: "research",
    command: "/research",
    label: "Scholarly research",
    labelMessageId: "helixAsk.slash.research.label",
    capabilityId: "scholarly-research.lookup_papers",
    expectedTerminalProductKind: "scholarly_research_answer",
    allowedTerminalProductKinds: ["scholarly_research_answer", "typed_failure"],
    description: "Find papers, fetch full text, and extract paper-backed evidence.",
    descriptionMessageId: "helixAsk.slash.research.description",
    insertionText: "Search scholarly research for ",
    insertionTextMessageId: "helixAsk.slash.research.insertion",
    permissionRequired: "act",
  },
  {
    id: "docs",
    command: "/docs",
    label: "Current document",
    labelMessageId: "helixAsk.slash.docs.label",
    capabilityId: "docs-viewer.read_visible_surface",
    expectedTerminalProductKind: "doc_evidence_synthesis_answer",
    allowedTerminalProductKinds: ["doc_evidence_synthesis_answer", "typed_failure"],
    description: "Use the active docs-viewer document or visible document context.",
    descriptionMessageId: "helixAsk.slash.docs.description",
    insertionText: "Use the current document context to ",
    insertionTextMessageId: "helixAsk.slash.docs.insertion",
    permissionRequired: "read",
  },
  {
    id: "image",
    command: "/image",
    label: "Image or screen",
    labelMessageId: "helixAsk.slash.image.label",
    capabilityId: "workstation.readable_surface.observe",
    expectedTerminalProductKind: "image_lens_observation_report",
    allowedTerminalProductKinds: ["image_lens_observation_report", "visual_frame_evidence", "typed_failure"],
    description: "Reason over an attached image or visible workstation surface.",
    descriptionMessageId: "helixAsk.slash.image.description",
    insertionText: "Use the attached image or visible screen context to ",
    insertionTextMessageId: "helixAsk.slash.image.insertion",
    permissionRequired: "observe",
  },
  {
    id: "notes",
    command: "/notes",
    label: "Workstation notes",
    labelMessageId: "helixAsk.slash.notes.label",
    capabilityId: "workstation-notes.list_notes",
    expectedTerminalProductKind: "model_synthesized_answer",
    allowedTerminalProductKinds: ["model_synthesized_answer", "typed_failure"],
    description: "Use available workstation notes as context.",
    descriptionMessageId: "helixAsk.slash.notes.description",
    insertionText: "Use workstation notes context to ",
    insertionTextMessageId: "helixAsk.slash.notes.insertion",
    permissionRequired: "read",
  },
  {
    id: "moral",
    command: "/moral",
    label: "Moral graph",
    labelMessageId: "helixAsk.slash.moral.label",
    capabilityId: "moral-graph.reflect_context",
    expectedTerminalProductKind: "agent_provider_terminal_candidate",
    allowedTerminalProductKinds: ["agent_provider_terminal_candidate", "typed_failure"],
    description: "Reflect on the current context with the moral graph.",
    descriptionMessageId: "helixAsk.slash.moral.description",
    insertionText: "Use the moral graph context to reflect on ",
    insertionTextMessageId: "helixAsk.slash.moral.insertion",
    permissionRequired: "read",
  },
  {
    id: "theory",
    command: "/theory",
    label: "Theory graph",
    labelMessageId: "helixAsk.slash.theory.label",
    capabilityId: "theory-badge-graph.reflect_discussion_context",
    expectedTerminalProductKind: "theory_context_reflection_answer",
    allowedTerminalProductKinds: ["theory_context_reflection_answer", "typed_failure"],
    description: "Use theory graph context to organize claims or conjectures.",
    descriptionMessageId: "helixAsk.slash.theory.description",
    insertionText: "Use the theory graph context to ",
    insertionTextMessageId: "helixAsk.slash.theory.insertion",
    permissionRequired: "read",
  },
  {
    id: "postulate",
    command: "/postulate",
    label: "Postulate review",
    labelMessageId: "helixAsk.slash.postulate.label",
    capabilityId: "postulate.submit_proposal",
    expectedTerminalProductKind: "postulate_runtime_review",
    allowedTerminalProductKinds: ["postulate_runtime_review", "typed_failure"],
    description: "Prepare a proposal for the postulate review lane and board.",
    descriptionMessageId: "helixAsk.slash.postulate.description",
    insertionText: "Send this postulate to be reviewed: ",
    insertionTextMessageId: "helixAsk.slash.postulate.insertion",
    permissionRequired: "act",
    fallbackPanelId: "postulate-board",
  },
  {
    id: "voice",
    command: "/voice",
    label: "Voice callout",
    labelMessageId: "helixAsk.slash.voice.label",
    capabilityId: "text_to_speech.speak_text",
    expectedTerminalProductKind: "model_synthesized_answer",
    allowedTerminalProductKinds: ["model_synthesized_answer", "voice_callout_receipt", "typed_failure"],
    description: "Ask for a spoken callout or narration after reasoning.",
    descriptionMessageId: "helixAsk.slash.voice.description",
    insertionText: "After reasoning, use voice narration to say ",
    insertionTextMessageId: "helixAsk.slash.voice.insertion",
    permissionRequired: "act",
  },
  {
    id: "situation-room",
    command: "/situation",
    label: "Situation room",
    labelMessageId: "helixAsk.slash.situationRoom.label",
    capabilityId: "situation-room-pipelines.inspect",
    expectedTerminalProductKind: "process_graph_overview",
    allowedTerminalProductKinds: ["process_graph_overview", "typed_failure"],
    description: "Developer-only pipeline and situation-room inspection scaffold.",
    descriptionMessageId: "helixAsk.slash.situationRoom.description",
    insertionText: "Use the situation room pipeline context to inspect ",
    insertionTextMessageId: "helixAsk.slash.situationRoom.insertion",
    permissionRequired: "read",
    developerOnly: true,
  },
];

export function listHelixAskSlashCommandCatalog(): HelixAskSlashCommandCatalogItem[] {
  return HELIX_ASK_SLASH_COMMAND_CATALOG.map((item) => ({ ...item }));
}

function titleCaseCapabilityToken(value: string): string {
  return value
    .split(/[-_]+/g)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function buildHelixAskGeneratedSlashCommandForCapability(
  capabilityId: string,
  translate?: HelixAskSlashCommandTranslate,
): HelixAskSlashCommandCatalogItem | null {
  const normalized = capabilityId.trim();
  if (!normalized || normalized === "*" || normalized.startsWith("permission:")) return null;
  const parts = normalized.split(".").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const commandSlug = parts
    .join("-")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  if (!commandSlug) return null;
  const label = parts.map(titleCaseCapabilityToken).join(" ");
  return {
    id: `capability:${normalized}`,
    command: `/${commandSlug}`,
    label,
    capabilityId: normalized,
    description: translate
      ? translate("helixAsk.slash.generated.description", { capabilityId: normalized })
      : `Use ${normalized} from the current account capability list.`,
    insertionText: translate
      ? translate("helixAsk.slash.generated.insertion", { capabilityId: normalized })
      : `Use the ${normalized} capability to `,
    generated: true,
  };
}

export function buildHelixAskSlashCommandCatalogForPolicy(
  policy: HelixAccountCapabilityPolicy | null | undefined,
  translate?: HelixAskSlashCommandTranslate,
): HelixAskSlashCommandCatalogItem[] {
  const accountPolicy = policy ?? HELIX_USER_ACCOUNT_POLICY;
  const curated = listHelixAskSlashCommandCatalog().map((item) => ({
    ...item,
    label: item.labelMessageId && translate ? translate(item.labelMessageId) : item.label,
    description: item.descriptionMessageId && translate ? translate(item.descriptionMessageId) : item.description,
    insertionText: item.insertionTextMessageId && translate ? translate(item.insertionTextMessageId) : item.insertionText,
  }));
  const curatedCapabilityIds = new Set(curated.map((item) => item.capabilityId));
  const generated = accountPolicy.allowed_workstation_capabilities
    .map((capabilityId) => buildHelixAskGeneratedSlashCommandForCapability(capabilityId, translate))
    .filter((item): item is HelixAskSlashCommandCatalogItem => Boolean(item))
    .filter((item) => !curatedCapabilityIds.has(item.capabilityId));
  return [...curated, ...generated];
}

export function buildHelixAskSlashCommandMenuItems(args: {
  accountPolicy?: HelixAccountCapabilityPolicy | null;
  runtime?: HelixAskSlashCommandRuntime | null;
  includeLocked?: boolean;
  translate?: HelixAskSlashCommandTranslate;
}): HelixAskSlashCommandMenuItem[] {
  const accountPolicy = args.accountPolicy ?? HELIX_USER_ACCOUNT_POLICY;
  const runtimeId = args.runtime?.id?.trim() ?? "";
  const publicPanelIds = new Set<string>(HELIX_USER_WORKSTATION_PANEL_IDS);
  return buildHelixAskSlashCommandCatalogForPolicy(accountPolicy, args.translate)
    .map((item): HelixAskSlashCommandMenuItem => {
      const runtimeAvailable =
        !item.runtimeIds || item.runtimeIds.length === 0 || item.runtimeIds.includes(runtimeId);
      const access = item.developerOnly && accountPolicy.account_type !== "developer"
        ? { state: "locked" as const, reason: "developer_only_command" }
        : resolveHelixWorkstationCapabilityAccess(accountPolicy, {
            capability_id: item.capabilityId,
            permission_profile_required: item.permissionRequired,
          });
      const fallbackPanelAccess = access.state === "available" || !item.fallbackPanelId
        ? null
        : resolveHelixAccountPanelAccess(accountPolicy, item.fallbackPanelId);
      const fallbackPanelIsCanonicalPublic = item.fallbackPanelId
        ? publicPanelIds.has(item.fallbackPanelId)
        : false;
      const resolvedAccess = fallbackPanelAccess?.state === "available" || fallbackPanelIsCanonicalPublic
        ? { state: "available" as const, reason: null }
        : access;
      return {
        ...item,
        accessState: resolvedAccess.state,
        accessReason: resolvedAccess.reason,
        runtimeAvailable,
        runtimeLabel: args.runtime?.label?.trim() || null,
      };
    })
    .filter((item) => args.includeLocked || (item.accessState === "available" && item.runtimeAvailable));
}
