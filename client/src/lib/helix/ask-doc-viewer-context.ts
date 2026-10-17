export function normalizeDocsViewerAnchorPath(value: string): string {
  const normalized = value.replace(/\\/g, "/").trim();
  if (/^[a-z]:\//i.test(normalized)) return normalized;
  return normalized.replace(/^\/+/, "");
}

const HELIX_DOCS_SUMMARY_REQUEST_RE =
  /\b(?:summari[sz]e|summary|explain|describe|tldr|tl;dr)\b[\s\S]*\b(?:doc|docs|document|read(?:ing)?|current)\b/i;
const HELIX_DOCS_VIEWER_CONTEXT_RE = /\bcurrent\s+docs?\s+viewer\s+context\b/i;
const HELIX_DOCS_PATH_LITERAL_RE =
  /\bdocument\s+path:\s*\/?docs\/[^\s]+|\/?docs\/[^\s]+\.(?:md|mdx|txt|rst|adoc)\b/i;

export type HelixAskAtomicViewerLaunchSuppressionInput = {
  question?: string | null;
  mode?: "read" | "observe" | "act" | "verify";
};

export function shouldSuppressAtomicViewerLaunch(
  args: HelixAskAtomicViewerLaunchSuppressionInput,
): boolean {
  const question = (args.question ?? "").trim();
  if (!question) return false;
  const docsSummaryCue = HELIX_DOCS_SUMMARY_REQUEST_RE.test(question);
  if (!docsSummaryCue) return false;
  return HELIX_DOCS_VIEWER_CONTEXT_RE.test(question) || HELIX_DOCS_PATH_LITERAL_RE.test(question);
}

export function normalizeDocViewerPathForAskSnapshot(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || /^[a-z]:\//i.test(normalized)) return null;
  return normalized.startsWith("docs/") ? normalized : null;
}

export type HelixAskDocViewerDebugSnapshotInput = {
  mode?: unknown;
  currentPath?: string | null;
  anchor?: unknown;
  pendingAutoReadNonce?: unknown;
  recent?: unknown;
};

export function buildDocViewerDebugSnapshotFromState(
  state: HelixAskDocViewerDebugSnapshotInput,
  currentPath: string | null,
): Record<string, unknown> {
  return {
    mode: state.mode,
    currentPath,
    anchor: state.anchor ?? null,
    pendingAutoReadNonce: state.pendingAutoReadNonce ?? null,
    recentCount: Array.isArray(state.recent) ? state.recent.length : 0,
  };
}

export type HelixAskDocViewerSnapshotPathResolution = {
  path: string | null;
  source:
    | "doc_viewer_store"
    | "doc_viewer_debug_snapshot"
    | "desktop_url_doc_param"
    | "doc_viewer_last_known"
    | "none";
};

export function resolveDocViewerSnapshotPathCandidate(args: {
  storePath?: unknown;
  debugSnapshotPath?: unknown;
  desktopUrlDocPath?: unknown;
  lastKnownPath?: unknown;
}): HelixAskDocViewerSnapshotPathResolution {
  const storePath = normalizeDocViewerPathForAskSnapshot(args.storePath);
  if (storePath) return { path: storePath, source: "doc_viewer_store" };

  const debugPath = normalizeDocViewerPathForAskSnapshot(args.debugSnapshotPath);
  if (debugPath) return { path: debugPath, source: "doc_viewer_debug_snapshot" };

  const urlPath = normalizeDocViewerPathForAskSnapshot(args.desktopUrlDocPath);
  if (urlPath) return { path: urlPath, source: "desktop_url_doc_param" };

  const rememberedPath = normalizeDocViewerPathForAskSnapshot(args.lastKnownPath);
  return rememberedPath
    ? { path: rememberedPath, source: "doc_viewer_last_known" }
    : { path: null, source: "none" };
}

const HELIX_DOC_VIEWER_DEICTIC_CUE_RE = /\b(?:this|current)\s+doc(?:ument)?\b/i;
const HELIX_DOC_VIEWER_CONTEXT_CUE_RE = /\b(?:docs?|document)\s+viewer(?:\s+context)?\b/i;
const HELIX_ACTIVE_DOC_VIEWER_ARTIFACT_CUE_RE =
  /\b(?:this|current|active|open)\s+(?:[a-z0-9._-]+\s+){0,4}(?:white\s*paper|whitepaper|paper|report|article|manuscript|spec(?:ification)?|brief|research\s+note|markdown|readme|document|doc)\b/i;
const HELIX_EXPLICIT_DOC_CONTEXT_PATH_CUE_RE =
  /(?:\b[a-z0-9_./-]+\.(?:ts|tsx|js|jsx|json|md|mdx|txt|pdf|docx?|ya?ml|py|go|rs)\b|(?:^|[\s(])\/?(?:docs|client|server|modules|shared)\/[^\s)]+)/i;

export function resolveDocsViewerAnchorPathCandidate(args: {
  question: string;
  answerContractSource?: string | null;
  currentPath?: string | null;
}): string | null {
  const docsCueDetected =
    HELIX_DOC_VIEWER_DEICTIC_CUE_RE.test(args.question) ||
    HELIX_DOC_VIEWER_CONTEXT_CUE_RE.test(args.question) ||
    HELIX_ACTIVE_DOC_VIEWER_ARTIFACT_CUE_RE.test(args.question) ||
    args.answerContractSource === "docs_viewer";
  if (!docsCueDetected) return null;

  const explicitPath = extractExplicitDocsViewerPath(args.question);
  if (explicitPath) return explicitPath;
  if (HELIX_EXPLICIT_DOC_CONTEXT_PATH_CUE_RE.test(args.question)) return null;

  const currentPath = args.currentPath ?? "";
  if (!currentPath) return null;
  const normalizedPath = normalizeDocsViewerAnchorPath(currentPath);
  return normalizedPath.length > 0 ? normalizedPath : null;
}

export function extractExplicitDocsViewerPath(question: string): string | null {
  const lineMatch = question.match(/document path:\s*([^\n\r]+)/i);
  const inlinePath = lineMatch?.[1]?.trim();
  if (inlinePath) {
    const normalized = normalizeDocsViewerAnchorPath(inlinePath);
    if (normalized) return normalized;
  }
  const tokenMatch = question.match(
    /\b([a-z0-9_./-]+\.(?:ts|tsx|js|jsx|json|md|mdx|txt|pdf|docx?|ya?ml|py|go|rs))\b/i,
  );
  const tokenPath = tokenMatch?.[1]?.trim();
  if (tokenPath) {
    const normalized = normalizeDocsViewerAnchorPath(tokenPath);
    if (normalized) return normalized;
  }
  return null;
}

export function normalizeDocPathForDebugCompare(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\\/g, "/");
  if (!trimmed) return null;
  return trimmed.replace(/^\/+/, "");
}
