const DOCS_PREFIX = "/docs";
const DOC_VIEWER_INTENT_KEY = "helix:doc-viewer:intent";

export const DOC_VIEWER_PANEL_ID = "docs-viewer";

export type DocViewerIntent =
  | { mode: "directory" }
  | { mode: "doc"; path: string; anchor?: string; autoRead?: boolean };

export type DocLinkDescriptor =
  | string
  | {
      href?: string;
      path?: string;
      anchor?: string;
      autoRead?: boolean;
    };

export function normalizeDocPath(input: string | undefined | null): string {
  const fallback = `${DOCS_PREFIX}/papers.md`;
  if (!input) return fallback;
  let normalized = input.trim();
  if (!normalized) return fallback;
  normalized = normalized.replace(/\\/g, "/");
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }
  if (!normalized.startsWith(DOCS_PREFIX)) {
    const withoutLeadingDocs = normalized.replace(/^\/?docs\/?/, "");
    normalized = `${DOCS_PREFIX}/${withoutLeadingDocs}`.replace(/\/{2,}/g, "/");
  }
  if (!normalized.startsWith(DOCS_PREFIX)) {
    normalized = `${DOCS_PREFIX}${normalized}`;
  }
  return normalized.replace(/\/{2,}/g, "/");
}

export function parseDocTarget(target: DocLinkDescriptor): { path: string; anchor?: string } {
  if (typeof target === "string") {
    return splitHref(target);
  }
  const root = target.path ?? target.href ?? "";
  const base = splitHref(root);
  return {
    path: normalizeDocPath(base.path),
    anchor: target.anchor ?? base.anchor,
  };
}

function splitHref(href: string): { path: string; anchor?: string } {
  if (!href) {
    return { path: normalizeDocPath(href) };
  }
  const [rawPath, rawAnchor] = href.split("#");
  const path = normalizeDocPath(rawPath);
  const anchor = rawAnchor ? decodeURIComponent(rawAnchor) : undefined;
  return { path, anchor };
}

export function makeDocHref(path: string, anchor?: string) {
  const normalized = normalizeDocPath(path);
  if (!anchor) return normalized;
  return `${normalized}#${encodeURIComponent(anchor)}`;
}

export function saveDocViewerIntent(intent: DocViewerIntent) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(DOC_VIEWER_INTENT_KEY, JSON.stringify(intent));
    return true;
  } catch {
    return false;
  }
}

export function consumeDocViewerIntent(): DocViewerIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DOC_VIEWER_INTENT_KEY);
    if (!raw) return null;
    window.localStorage.removeItem(DOC_VIEWER_INTENT_KEY);
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      if (parsed.mode === "directory") {
        return { mode: "directory" };
      }
      if (parsed.mode === "doc" && typeof parsed.path === "string") {
        return {
          mode: "doc",
          path: normalizeDocPath(parsed.path),
          anchor: typeof parsed.anchor === "string" ? parsed.anchor : undefined,
          autoRead: parsed.autoRead === true,
        };
      }
    }
  } catch {
    // ignore malformed payloads
  }
  return null;
}
