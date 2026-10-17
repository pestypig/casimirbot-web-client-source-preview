import {
  HELIX_WORKFLOW_DEMO_CONTEXT_SCHEMA,
  type HelixWorkflowDemoContextBindingV1,
} from "@shared/contracts/helix-workflow-demo.v1";

type ChatMessageLike = {
  id?: string;
  role?: string;
  content?: string;
  at?: string;
  traceId?: string;
};

type ChatSessionLike = {
  id?: string;
  contextId?: string;
  updatedAt?: string;
  messages?: readonly ChatMessageLike[];
};

export type HelixWorkflowDemoContextCandidate = {
  objective: string;
  sourceSessionId: string;
  sourceMessageId: string;
  sourceTraceId: string | null;
  sourceMessageAt: string | null;
  confidence: "high" | "medium";
  reason: string;
};

const SCIENCE_TERMS = [
  "arxiv",
  "casimir",
  "citation",
  "doi",
  "energy",
  "equation",
  "evidence",
  "field",
  "geometry",
  "negative energy",
  "paper",
  "physics",
  "quantum",
  "research",
  "scalar",
  "scientific",
  "theory",
  "warp",
  "wormhole",
] as const;

const RESEARCH_INTENT = /\b(?:find|search|research|cite|support|investigate|analy[sz]e|compare|paper|papers|scholarly|primary source|full text|pdf)\b/i;
const SYNTHETIC_OR_DEBUG = /(?:^|\b)(?:LOOKUP_SMOKE_\d+|smoke test|test fixture|terminal_authority|route authority|classifier defect|debug export)(?:\b|\s*[—-])/i;

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

const clipObjective = (value: string, limit = 360): string => {
  if (value.length <= limit) return value;
  const clipped = value.slice(0, limit - 1);
  const boundary = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, boundary > limit * 0.65 ? boundary : clipped.length)}…`;
};

const timestampScore = (value: unknown): number => {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

const hashText = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

const candidateFromSession = (session: ChatSessionLike): HelixWorkflowDemoContextCandidate | null => {
  const sessionId = normalizeText(session.id);
  if (!sessionId) return null;
  const messages = [...(session.messages ?? [])]
    .filter((message) => message.role === "user")
    .sort((left, right) => timestampScore(right.at) - timestampScore(left.at))
    .slice(0, 24);

  for (const message of messages) {
    const content = normalizeText(message.content);
    if (content.length < 24 || SYNTHETIC_OR_DEBUG.test(content)) continue;
    const normalized = content.toLowerCase();
    const scienceTermCount = SCIENCE_TERMS.reduce(
      (count, term) => count + (normalized.includes(term) ? 1 : 0),
      0,
    );
    const hasResearchIntent = RESEARCH_INTENT.test(content);
    if (scienceTermCount < 2 || !hasResearchIntent) continue;
    const messageId = normalizeText(message.id);
    if (!messageId) continue;
    return {
      objective: clipObjective(content),
      sourceSessionId: sessionId,
      sourceMessageId: messageId,
      sourceTraceId: normalizeText(message.traceId) || null,
      sourceMessageAt: normalizeText(message.at) || null,
      confidence: scienceTermCount >= 4 ? "high" : "medium",
      reason: "Latest bounded user research objective from the active Helix Ask chat.",
    };
  }
  return null;
};

export const selectHelixWorkflowDemoContextCandidate = (input: {
  sessions: Record<string, ChatSessionLike>;
  activeId?: string | null;
}): HelixWorkflowDemoContextCandidate | null => {
  const sessions = Object.values(input.sessions)
    .filter((session) => normalizeText(session.contextId).startsWith("helix-ask"));
  const active = input.activeId ? input.sessions[input.activeId] : null;
  if (active && normalizeText(active.contextId).startsWith("helix-ask")) {
    return candidateFromSession(active);
  }
  for (const session of sessions.sort((left, right) => timestampScore(right.updatedAt) - timestampScore(left.updatedAt))) {
    const candidate = candidateFromSession(session);
    if (candidate) return candidate;
  }
  return null;
};

export const createHelixWorkflowDemoCurrentChatBinding = (
  candidate: HelixWorkflowDemoContextCandidate,
  boundAt = new Date().toISOString(),
): HelixWorkflowDemoContextBindingV1 => {
  const objective = normalizeText(candidate.objective);
  const objectiveHash = hashText(objective);
  return {
    schema: HELIX_WORKFLOW_DEMO_CONTEXT_SCHEMA,
    bindingId: `workflow-context:${objectiveHash.slice("fnv1a32:".length)}:${Date.parse(boundAt) || Date.now()}`,
    sourceKind: "current_chat",
    objective,
    objectiveHash,
    sourceSessionId: candidate.sourceSessionId,
    sourceMessageId: candidate.sourceMessageId,
    sourceTraceId: candidate.sourceTraceId,
    sourceMessageAt: candidate.sourceMessageAt,
    confidence: candidate.confidence,
    confirmedByOperator: true,
    boundAt,
  };
};

export const createHelixWorkflowDemoCustomBinding = (
  objectiveInput: string,
  boundAt = new Date().toISOString(),
): HelixWorkflowDemoContextBindingV1 | null => {
  const objective = clipObjective(normalizeText(objectiveInput));
  if (!objective) return null;
  const objectiveHash = hashText(objective);
  return {
    schema: HELIX_WORKFLOW_DEMO_CONTEXT_SCHEMA,
    bindingId: `workflow-context:${objectiveHash.slice("fnv1a32:".length)}:${Date.parse(boundAt) || Date.now()}`,
    sourceKind: "custom",
    objective,
    objectiveHash,
    sourceSessionId: null,
    sourceMessageId: null,
    sourceTraceId: null,
    sourceMessageAt: null,
    confidence: "operator",
    confirmedByOperator: true,
    boundAt,
  };
};

export const renderHelixWorkflowDemoPromptTemplate = (
  template: string,
  binding: HelixWorkflowDemoContextBindingV1,
  evidenceRefs: {
    paperRef?: string | null;
    renderedPageRef?: string | null;
    ocrMathCandidateRef?: string | null;
    promotedEquationRef?: string | null;
    graphReflectionRef?: string | null;
    provenanceAuditRef?: string | null;
  } = {},
): string => {
  const replacements: Record<string, string> = {
    research_topic: binding.objective,
    paper_ref: evidenceRefs.paperRef ?? "unavailable",
    rendered_page_ref: evidenceRefs.renderedPageRef ?? "unavailable",
    ocr_math_candidate_ref: evidenceRefs.ocrMathCandidateRef ?? "unavailable",
    promoted_equation_ref: evidenceRefs.promotedEquationRef ?? "unavailable",
    graph_reflection_ref: evidenceRefs.graphReflectionRef ?? "unavailable",
    provenance_audit_ref: evidenceRefs.provenanceAuditRef ?? "unavailable",
  };
  return Object.entries(replacements).reduce(
    (rendered, [key, value]) => rendered.replaceAll(`{{${key}}}`, value),
    template,
  );
};
