import { type RepoSnapshot, type SnapshotFileEntry } from "./types";

type SourceLoader = () => Promise<string>;

type SnapshotDriver = "vite-glob" | "server-api" | "static-asset" | "none";

export type SnapshotDiagnostics = {
  driver: SnapshotDriver;
  matched: number;
  patterns: readonly string[];
  origin?: string;
  error?: string;
};

const CODE_FILE_PATTERN = /\.(c|m)?(t|j)sx?$/i;

const SOURCE_PATTERNS = [
  "/src/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}",
  "/../server/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}",
  "/../shared/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}",
  "/../modules/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}",
] as const;

const sourceLoaders = new Map<string, SourceLoader>();
const sourceCache = new Map<string, string>();
let sourceListLoadAttempted = false;

function normalizeSourceKey(raw: string) {
  let normalized = raw.replace(/\\/g, "/");

  if (!normalized) return null;

  if (normalized.startsWith("./")) {
    const next = normalized.slice(2);
    return next ? `client/${next}` : "client";
  }
  if (normalized.startsWith("../server/")) {
    return `server/${normalized.slice("../server/".length)}`;
  }
  if (normalized.startsWith("../shared/")) {
    return `shared/${normalized.slice("../shared/".length)}`;
  }
  if (normalized.startsWith("../modules/")) {
    return `modules/${normalized.slice("../modules/".length)}`;
  }

  normalized = normalized.replace(/^\/+/, "");

  if (normalized.startsWith("workspace/")) {
    normalized = normalized.slice("workspace/".length);
  }

  if (normalized.startsWith("client/")) return normalized;
  if (normalized.startsWith("src/")) return `client/${normalized}`;
  if (normalized.startsWith("server/")) return normalized;
  if (normalized.startsWith("shared/")) return normalized;
  if (normalized.startsWith("modules/")) return normalized;

  return null;
}

function registerSources(record: Record<string, SourceLoader>) {
  for (const [key, loader] of Object.entries(record)) {
    const normalized = normalizeSourceKey(key);
    if (!normalized) continue;
    sourceLoaders.set(normalized, loader);
  }
}

async function registerDevGlobSources() {
  if (sourceListLoadAttempted || !import.meta.env.DEV) return;
  sourceListLoadAttempted = true;
  const sourceListUrl = "/src/lib/code-index/source-list.ts";
  const sourceList = await import(/* @vite-ignore */ sourceListUrl) as {
    SOURCE_LOADERS: Record<string, SourceLoader>;
  };
  registerSources(sourceList.SOURCE_LOADERS);
}

function countMatchedSources() {
  let count = 0;
  for (const path of sourceLoaders.keys()) {
    if (CODE_FILE_PATTERN.test(path)) count += 1;
  }
  return count;
}

let lastDiagnostics: SnapshotDiagnostics = {
  driver: "vite-glob",
  matched: countMatchedSources(),
  patterns: SOURCE_PATTERNS,
  origin: "import.meta.glob",
};

function setDiagnostics(diag: SnapshotDiagnostics) {
  lastDiagnostics = diag;
}

export function getSnapshotDiagnostics() {
  return lastDiagnostics;
}

function setVirtualSource(path: string, content: string) {
  sourceLoaders.set(path, async () => content);
  sourceCache.set(path, content);
}

export function snapshotSourcePaths() {
  return Array.from(sourceLoaders.keys()).sort();
}

export function clearSnapshotCache() {
  sourceCache.clear();
}

const DEFAULT_COMMIT =
  (import.meta.env?.VITE_GIT_COMMIT_SHA as string | undefined) ??
  (import.meta.env?.VITE_GIT_COMMIT as string | undefined) ??
  (import.meta.env?.VITE_GIT_SHA as string | undefined) ??
  "workspace";

async function resolveSource(path: string) {
  const loader = sourceLoaders.get(path);
  if (!loader) return null;
  const cached = sourceCache.get(path);
  if (cached !== undefined) return cached;
  const content = await loader();
  sourceCache.set(path, content);
  return content;
}

export async function loadSnapshotSource(path: string) {
  await registerDevGlobSources();
  return resolveSource(path);
}

export type SnapshotInputFile = {
  path: string;
  content: string | ArrayBuffer | Uint8Array;
  lang?: string;
};

export type SnapshotDiff = {
  added: SnapshotFileEntry[];
  removed: SnapshotFileEntry[];
  changed: Array<{ path: string; previous: SnapshotFileEntry; next: SnapshotFileEntry }>;
};

const encoder = new TextEncoder();

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\.?\//, "");
}

function guessLang(path: string) {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".mts") || path.endsWith(".cts")) return "ts";
  if (path.endsWith(".d.ts") || path.endsWith(".ts")) return "ts";
  if (path.endsWith(".jsx")) return "jsx";
  if (path.endsWith(".mjs") || path.endsWith(".cjs") || path.endsWith(".js")) return "js";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "md";
  if (path.endsWith(".html")) return "html";
  return "text";
}

function toUint8Array(content: SnapshotInputFile["content"]) {
  if (typeof content === "string") return encoder.encode(content);
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  return content;
}

async function sha256Hex(bytes: Uint8Array) {
  const hasWebCrypto =
    typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.subtle !== "undefined";
  if (hasWebCrypto) {
    const buf = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  const isNodeLike =
    typeof process !== "undefined" &&
    typeof process.versions === "object" &&
    typeof process.versions?.node === "string";
  if (isNodeLike) {
    const { createHash } = await import(/* @vite-ignore */ "node:crypto").catch(async () => {
      return import(/* @vite-ignore */ "crypto");
    });
    return createHash("sha256").update(bytes).digest("hex");
  }

  throw new Error("Unable to compute SHA-256: no crypto implementation available");
}

export async function createRepoSnapshot(
  root: string,
  commit: string,
  files: SnapshotInputFile[],
): Promise<RepoSnapshot> {
  const entries: SnapshotFileEntry[] = [];
  for (const file of files) {
    const normalizedPath = normalizePath(file.path);
    const bytes = toUint8Array(file.content);
    const sha256 = await sha256Hex(bytes);
    entries.push({
      path: normalizedPath,
      sha256,
      bytes: bytes.byteLength,
      lang: file.lang ?? guessLang(normalizedPath),
    });
  }
  entries.sort((a, b) => {
    if (a.path === b.path) return a.sha256.localeCompare(b.sha256);
    return a.path.localeCompare(b.path);
  });

  return {
    root,
    commit,
    files: entries,
    createdAt: Date.now(),
  };
}

type RemoteSnapshotFile = {
  path?: string;
  text?: string;
  content?: string;
  lang?: string;
};

type RemoteSnapshotPayload = {
  root?: string;
  commit?: string;
  createdAt?: number;
  files?: RemoteSnapshotFile[];
};

type FallbackEndpoint = {
  url: string;
  driver: Extract<SnapshotDriver, "server-api" | "static-asset">;
  compressed?: boolean;
};

const FALLBACK_ENDPOINTS: FallbackEndpoint[] = [
  { url: "/api/code/snapshot", driver: "server-api" },
  { url: "/code-snapshot.json", driver: "static-asset" },
  { url: "/code-snapshot.json.gz", driver: "static-asset", compressed: true },
];

async function readSnapshotPayload(
  response: Response,
  compressed: boolean,
): Promise<RemoteSnapshotPayload> {
  if (!compressed) {
    return (await response.json()) as RemoteSnapshotPayload;
  }

  if (typeof DecompressionStream === "undefined" || !response.body) {
    throw new Error("Compressed snapshot requires DecompressionStream support.");
  }

  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(stream).text();
  return JSON.parse(text) as RemoteSnapshotPayload;
}

function sanitizeRemotePath(rawPath: unknown) {
  if (typeof rawPath !== "string") return null;

  const normalized = normalizeSourceKey(rawPath);
  if (normalized) return normalized;

  const stripped = normalizePath(rawPath);
  const retry = normalizeSourceKey(stripped);
  if (retry) return retry;

  const withClient = normalizeSourceKey(`client/${stripped}`);
  if (withClient) return withClient;

  return null;
}

async function fetchRemoteSnapshot(endpoint: FallbackEndpoint) {
  if (typeof fetch !== "function") {
    return {
      success: false as const,
      error: "fetch API is not available in this environment.",
    };
  }

  let response: Response;
  try {
    response = await fetch(endpoint.url, { cache: "no-store" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false as const, error: message };
  }

  if (!response.ok) {
    return {
      success: false as const,
      error: `${response.status} ${response.statusText}`.trim(),
    };
  }

  let payload: RemoteSnapshotPayload;
  try {
    payload = await readSnapshotPayload(response, endpoint.compressed ?? false);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse snapshot payload.";
    return { success: false as const, error: message };
  }

  if (!payload || !Array.isArray(payload.files)) {
    return { success: false as const, error: "Snapshot payload missing files array." };
  }

  const files: SnapshotInputFile[] = [];
  for (const file of payload.files) {
    const path = sanitizeRemotePath(file?.path);
    if (!path) continue;
    if (!CODE_FILE_PATTERN.test(path)) continue;

    const text =
      typeof file?.text === "string"
        ? file.text
        : typeof file?.content === "string"
          ? file.content
          : undefined;
    if (typeof text !== "string") continue;

    files.push({
      path,
      content: text,
      lang: typeof file?.lang === "string" ? file.lang : guessLang(path),
    });
  }

  if (!files.length) {
    return {
      success: false as const,
      error: "Snapshot payload contained 0 indexable source files.",
    };
  }

  for (const file of files) {
    if (typeof file.content === "string") {
      setVirtualSource(file.path, file.content);
    }
  }

  const root = typeof payload.root === "string" && payload.root.length ? payload.root : "workspace";
  const commitFromPayload =
    typeof payload.commit === "string" && payload.commit.length ? payload.commit : undefined;

  const snapshot = await createRepoSnapshot(root, commitFromPayload ?? DEFAULT_COMMIT, files);
  return {
    success: true as const,
    snapshot,
    matched: files.length,
  };
}

export async function buildSnapshot(): Promise<RepoSnapshot> {
  await registerDevGlobSources();
  const globPaths = snapshotSourcePaths().filter((path) => CODE_FILE_PATTERN.test(path));

  const files: SnapshotInputFile[] = [];
  const failedLoads: string[] = [];
  if (globPaths.length) {
    for (const path of globPaths) {
      const content = await resolveSource(path);
      if (typeof content !== "string") {
        failedLoads.push(path);
        continue;
      }
      files.push({ path, content, lang: guessLang(path) });
    }

    if (files.length) {
      const error =
        failedLoads.length === 0
          ? undefined
          : `Skipped ${failedLoads.length} file${failedLoads.length === 1 ? "" : "s"} that failed to load.`;
      setDiagnostics({
        driver: "vite-glob",
        matched: globPaths.length,
        patterns: SOURCE_PATTERNS,
        origin: "import.meta.glob",
        error,
      });
      return createRepoSnapshot("workspace", DEFAULT_COMMIT, files);
    }
  }

  const fallbackErrors: string[] = [];
  if (globPaths.length) {
    const reason =
      failedLoads.length > 0
        ? `Matched ${globPaths.length} file${globPaths.length === 1 ? "" : "s"} but none could be loaded (${failedLoads.length} failures).`
        : `Matched ${globPaths.length} file${globPaths.length === 1 ? "" : "s"} but produced no content.`;
    fallbackErrors.push(`import.meta.glob: ${reason}`);
  } else {
    fallbackErrors.push("import.meta.glob matched 0 files.");
  }

  for (const endpoint of FALLBACK_ENDPOINTS) {
    const attempt = await fetchRemoteSnapshot(endpoint);
    if (attempt.success) {
      setDiagnostics({
        driver: endpoint.driver,
        matched: attempt.matched,
        patterns: [endpoint.url],
        origin: endpoint.url,
      });
      return attempt.snapshot;
    }
    fallbackErrors.push(`${endpoint.url}: ${attempt.error}`);
  }

  const message = fallbackErrors.join("\n");
  setDiagnostics({
    driver: "none",
    matched: 0,
    patterns: SOURCE_PATTERNS,
    origin: "import.meta.glob",
    error: message,
  });
  throw new Error(message);
}

export function diffSnapshots(previous: RepoSnapshot, next: RepoSnapshot): SnapshotDiff {
  const prevMap = new Map(previous.files.map((file) => [file.path, file]));
  const nextMap = new Map(next.files.map((file) => [file.path, file]));

  const added: SnapshotFileEntry[] = [];
  const removed: SnapshotFileEntry[] = [];
  const changed: SnapshotDiff["changed"] = [];

  for (const [path, file] of nextMap) {
    const prev = prevMap.get(path);
    if (!prev) {
      added.push(file);
      continue;
    }
    if (prev.sha256 !== file.sha256 || prev.bytes !== file.bytes) {
      changed.push({ path, previous: prev, next: file });
    }
  }

  for (const [path, file] of prevMap) {
    if (!nextMap.has(path)) {
      removed.push(file);
    }
  }

  return { added, removed, changed };
}

export function snapshotFingerprint(snapshot: RepoSnapshot) {
  return `${snapshot.root}@${snapshot.commit}:${snapshot.files.length}`;
}

export function serializeSnapshot(snapshot: RepoSnapshot) {
  return JSON.stringify(snapshot, null, 2);
}
