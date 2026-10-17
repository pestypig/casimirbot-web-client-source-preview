import {
  type KnowledgeFileAttachment,
  type KnowledgeFileKind,
  type KnowledgeProjectExport,
  type KnowledgeProjectMeta,
  KNOWLEDGE_DEFAULT_FILES_PER_PROJECT,
  KNOWLEDGE_FALLBACK_ALLOWED_MIME,
} from "@shared/knowledge";

const DB_NAME = "agi-knowledge";
const DB_VERSION = 2;
const STORE_FILES = "files";
const STORE_PROJECTS = "projects";
export const DEFAULT_PROJECT_ID = "project:default";

export type KnowledgeProjectRecord = KnowledgeProjectMeta & {
  createdAt: number;
  updatedAt: number;
};

export type KnowledgeFileAnalysis = {
  durationSec?: number;
  rms?: number;
  peak?: number;
  zcr?: number;
  brightness?: number;
  waveformPeaks?: number[];
};

export type KnowledgeFileRecord = {
  id: string;
  name: string;
  mime: string;
  type?: string;
  size: number;
  createdAt: number;
  updatedAt: number;
  projectId: string;
  hashSlug: string;
  kind: KnowledgeFileKind;
  path?: string;
  tags?: string[];
  autoTags?: string[];
  analysis?: KnowledgeFileAnalysis;
  data: Blob;
};

export type CreateProjectPayload = Pick<KnowledgeProjectMeta, "name" | "color" | "tags" | "type" | "meta">;

const PREVIEW_CHAR_LIMIT = 600;
const PREVIEW_BYTE_LIMIT = 4096;
const INLINE_CONTENT_LIMIT = 32_768;
const MIN_PREVIEW_BUDGET = 64;
const encoder = new TextEncoder();
const PDF_TEXT_LIMIT = INLINE_CONTENT_LIMIT;
const PDF_PAGE_LIMIT = 20;
const WHITESPACE_RE = /\s+/g;

type EnvShape = Record<string, string | undefined>;
const env: EnvShape = ((import.meta as any)?.env ?? {}) as EnvShape;

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const parseMimeList = (value: string | undefined): string[] => {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
};

const normalizeMime = (value: string | undefined, fallback?: string): string => {
  const normalized = value?.toLowerCase();
  if (!normalized || normalized === "application/octet-stream") {
    return fallback ?? "application/octet-stream";
  }
  const alias = MIME_ALIASES[normalized];
  return (alias ?? normalized).trim();
};

const allowedMimeList =
  parseMimeList(env.KNOWLEDGE_ALLOWED_MIME ?? env.VITE_KNOWLEDGE_ALLOWED_MIME) ?? KNOWLEDGE_FALLBACK_ALLOWED_MIME;
const resolvedAllowedMime =
  allowedMimeList.length > 0 ? allowedMimeList : KNOWLEDGE_FALLBACK_ALLOWED_MIME.map((mime) => mime.toLowerCase());
const allowedMimeSet = new Set(resolvedAllowedMime);
const filesPerProjectLimit = parsePositiveInt(
  env.MAX_KNOWLEDGE_FILES_PER_PROJECT ?? env.VITE_MAX_KNOWLEDGE_FILES_PER_PROJECT,
  KNOWLEDGE_DEFAULT_FILES_PER_PROJECT,
);

const MIME_ALIASES: Record<string, string> = {
  "text/x-markdown": "text/markdown",
  "application/x-json": "application/json",
  "text/json": "application/json",
  "audio/mp3": "audio/mpeg",
  "audio/x-mp3": "audio/mpeg",
  "audio/x-wav": "audio/wav",
  "audio/x-midi": "audio/midi",
  "audio/mid": "audio/midi",
  "application/midi": "audio/midi",
  "application/x-midi": "audio/midi",
};

const EXTENSION_MIME: Record<string, string> = {
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".txt": "text/plain",
  ".json": "application/json",
  ".pdf": "application/pdf",
  ".csv": "text/plain",
  ".ts": "text/plain",
  ".tsx": "text/plain",
  ".js": "text/plain",
  ".jsx": "text/plain",
  ".py": "text/plain",
  ".rs": "text/plain",
  ".c": "text/plain",
  ".cpp": "text/plain",
  ".h": "text/plain",
  ".hpp": "text/plain",
  ".java": "text/plain",
  ".cs": "text/plain",
  ".mjs": "text/plain",
  ".cjs": "text/plain",
  ".wav": "audio/wav",
  ".wave": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mpeg",
  ".aac": "audio/mpeg",
  ".mid": "audio/midi",
  ".midi": "audio/midi",
};

const PROJECT_SLUG_FALLBACK = "project";
const FILE_SLUG_FALLBACK = "file";
const pdfTextCache = new Map<string, string | null>();
const pdfTextInflight = new Map<string, Promise<string | null>>();

let dbPromise: Promise<IDBDatabase> | null = null;

function assertIndexedDB(): IDBFactory {
  const factory = globalThis.indexedDB;
  if (!factory) {
    throw new Error("IndexedDB is not available in this environment.");
  }
  return factory;
}

function getRandomId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
}

const slugify = (value: string, fallback: string): string => {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
};

const projectSlug = (name: string, id: string): string => `${slugify(name, PROJECT_SLUG_FALLBACK)}-${id.slice(-4)}`;
const fileSlug = (name: string, id: string): string => `${slugify(name, FILE_SLUG_FALLBACK)}-${id.slice(-4)}`;

const defaultProjectRecord = (): KnowledgeProjectRecord => {
  const now = Date.now();
  return {
    id: DEFAULT_PROJECT_ID,
    name: "My Knowledge",
    color: "#22d3ee",
    tags: [],
    type: "general",
    hashSlug: "my-knowledge",
    active: false,
    createdAt: now,
    updatedAt: now,
  };
};

function upgradeDatabase(db: IDBDatabase, event: IDBVersionChangeEvent) {
  const tx = event.currentTarget instanceof IDBOpenDBRequest ? event.currentTarget.transaction : null;
  if (!tx) return;

  let filesStore: IDBObjectStore;
  if (!db.objectStoreNames.contains(STORE_FILES)) {
    filesStore = db.createObjectStore(STORE_FILES, { keyPath: "id" });
  } else {
    filesStore = tx.objectStore(STORE_FILES);
  }

  if (!filesStore.indexNames.contains("projectId")) {
    filesStore.createIndex("projectId", "projectId", { unique: false });
  }
  if (!filesStore.indexNames.contains("hashSlug")) {
    filesStore.createIndex("hashSlug", "hashSlug", { unique: false });
  }

  let projectStore: IDBObjectStore;
  if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
    projectStore = db.createObjectStore(STORE_PROJECTS, { keyPath: "id" });
  } else {
    projectStore = tx.objectStore(STORE_PROJECTS);
  }
  if (!projectStore.indexNames.contains("hashSlug")) {
    projectStore.createIndex("hashSlug", "hashSlug", { unique: true });
  }

  const ensureDefault = projectStore.get(DEFAULT_PROJECT_ID);
  ensureDefault.onsuccess = () => {
    if (!ensureDefault.result) {
      projectStore.put(defaultProjectRecord());
    }
  };

  const cursorRequest = filesStore.openCursor();
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    const value = cursor.value as KnowledgeFileRecord & { type?: string };
    let changed = false;
    if (!value.projectId) {
      value.projectId = DEFAULT_PROJECT_ID;
      changed = true;
    }
    if (!value.hashSlug) {
      value.hashSlug = fileSlug(value.name ?? FILE_SLUG_FALLBACK, value.id ?? getRandomId());
      changed = true;
    }
    if (!value.mime && value.type) {
      value.mime = value.type;
      changed = true;
    }
    if (!value.kind) {
      value.kind = inferFileKind(value.mime ?? "application/octet-stream", value.name ?? "");
      changed = true;
    }
    if (changed) {
      cursor.update(value);
    }
    cursor.continue();
  };
}

export function openKnowledgeDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = assertIndexedDB().open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      upgradeDatabase(request.result, event);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

const txDone = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

const requestResult = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const guessMimeFromName = (name: string): string | undefined => {
  const lower = name.toLowerCase();
  for (const [ext, mime] of Object.entries(EXTENSION_MIME)) {
    if (lower.endsWith(ext)) {
      return mime;
    }
  }
  return undefined;
};

function inferFileKind(mime: string, name: string): KnowledgeFileKind {
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  if (mime.includes("json")) return "json";
  if (mime === "text/markdown") return "text";
  if (mime.startsWith("text/")) {
    if (/\.(ts|tsx|js|jsx|py|rs|c|cpp|java|cs|rb|go|sh|m|swift|kt|mjs|cjs)$/i.test(name)) {
      return "code";
    }
    return "text";
  }
  return "text";
}

const pdfCacheKey = (record: KnowledgeFileRecord): string => record.id ?? `${record.name}:${record.size}`;

type PdfExtractorModule = typeof import("@/lib/rag/ingest-pdf");
let pdfExtractorPromise: Promise<PdfExtractorModule> | null = null;

const loadPdfExtractor = async (): Promise<PdfExtractorModule> => {
  if (!pdfExtractorPromise) {
    pdfExtractorPromise = import("@/lib/rag/ingest-pdf").catch((error) => {
      pdfExtractorPromise = null;
      throw error;
    });
  }
  return pdfExtractorPromise;
};

const normalizePdfText = (value: string | undefined): string => (value ?? "").replace(WHITESPACE_RE, " ").trim();

async function getPdfText(record: KnowledgeFileRecord): Promise<string | null> {
  if (!isPdfRecord(record)) {
    return null;
  }
  if (typeof window === "undefined" || typeof File === "undefined") {
    return null;
  }
  const key = pdfCacheKey(record);
  if (pdfTextCache.has(key)) {
    return pdfTextCache.get(key) ?? null;
  }
  if (pdfTextInflight.has(key)) {
    return pdfTextInflight.get(key)!;
  }
  const task = (async () => {
    try {
      const { extractTextFromPDF } = await loadPdfExtractor();
      const file = new File([record.data], record.name || "document.pdf", {
        type: record.mime || "application/pdf",
      });
      const raw = await extractTextFromPDF(file, { maxPages: PDF_PAGE_LIMIT });
      const normalized = normalizePdfText(raw);
      if (!normalized) {
        return null;
      }
      return normalized.slice(0, PDF_TEXT_LIMIT);
    } catch {
      return null;
    }
  })();
  pdfTextInflight.set(key, task);
  const result = await task;
  pdfTextInflight.delete(key);
  pdfTextCache.set(key, result);
  return result;
}

const ensureMimeAllowed = (mime: string) => {
  if (!allowedMimeSet.has(mime.toLowerCase())) {
    throw new Error(`File type ${mime} is not allowed for knowledge projects.`);
  }
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
};

const isPdfRecord = (record: KnowledgeFileRecord): boolean =>
  record.mime?.includes("pdf") || record.name.toLowerCase().endsWith(".pdf");

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(buffer).toString("base64");
  }
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return globalThis.btoa ? globalThis.btoa(binary) : binary;
};

const normalizeTags = (tags: string[] | undefined): string[] => {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const entry of tags) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
  }
  return normalized;
};

export async function extractKnowledgePdfText(record: KnowledgeFileRecord): Promise<string | null> {
  return getPdfText(record);
}

export async function createProject(payload: CreateProjectPayload): Promise<KnowledgeProjectRecord> {
  const db = await openKnowledgeDB();
  const now = Date.now();
  const id = `project:${getRandomId()}`;
  const baseSlug = projectSlug(payload.name, id);
  const slug = await ensureUniqueProjectSlug(baseSlug, db);
  const record: KnowledgeProjectRecord = {
    id,
    name: payload.name.trim(),
    color: payload.color ?? "#a855f7",
    tags: payload.tags ?? [],
    type: payload.type,
    meta: payload.meta,
    hashSlug: slug,
    active: false,
    createdAt: now,
    updatedAt: now,
  };
  const tx = db.transaction(STORE_PROJECTS, "readwrite");
  tx.objectStore(STORE_PROJECTS).put(record);
  await txDone(tx);
  return record;
}

export async function updateProject(patch: KnowledgeProjectRecord): Promise<KnowledgeProjectRecord> {
  const db = await openKnowledgeDB();
  const tx = db.transaction(STORE_PROJECTS, "readwrite");
  const store = tx.objectStore(STORE_PROJECTS);
  const existing = await requestResult<KnowledgeProjectRecord | undefined>(store.get(patch.id));
  if (!existing) {
    throw new Error(`Project ${patch.id} not found`);
  }
  const next: KnowledgeProjectRecord = {
    ...existing,
    ...patch,
    name: patch.name?.trim() || existing.name,
    tags: Array.isArray(patch.tags) ? patch.tags : existing.tags,
    updatedAt: Date.now(),
  };
  store.put(next);
  await txDone(tx);
  return next;
}

export async function deleteProject(projectId: string): Promise<void> {
  if (projectId === DEFAULT_PROJECT_ID) {
    throw new Error("Cannot delete the default knowledge project.");
  }
  const db = await openKnowledgeDB();
  const tx = db.transaction([STORE_PROJECTS, STORE_FILES], "readwrite");
  const filesStore = tx.objectStore(STORE_FILES);
  const index = filesStore.index("projectId");
  const cursorRequest = index.openCursor(IDBKeyRange.only(projectId));
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    const record = cursor.value as KnowledgeFileRecord;
    record.projectId = DEFAULT_PROJECT_ID;
    record.updatedAt = Date.now();
    cursor.update(record);
    cursor.continue();
  };
  tx.objectStore(STORE_PROJECTS).delete(projectId);
  await txDone(tx);
}

const ensureUniqueProjectSlug = async (slug: string, db: IDBDatabase): Promise<string> => {
  const tx = db.transaction(STORE_PROJECTS, "readonly");
  const index = tx.objectStore(STORE_PROJECTS).index("hashSlug");
  const keys = (await requestResult(index.getAllKeys())) as string[];
  let uniqueSlug = slug;
  let suffix = 1;
  const existing = new Set(keys.map((key) => key?.toString()));
  while (existing.has(uniqueSlug)) {
    uniqueSlug = `${slug}-${suffix}`;
    suffix += 1;
  }
  return uniqueSlug;
};

const ensureFileRecord = (file: File, projectId: string): KnowledgeFileRecord => {
  const now = Date.now();
  const id = getRandomId();
  const guessedMime = normalizeMime(file.type, guessMimeFromName(file.name));
  ensureMimeAllowed(guessedMime);
  return {
    id,
    name: file.name,
    mime: guessedMime,
    type: guessedMime,
    size: file.size,
    createdAt: now,
    updatedAt: now,
    projectId,
    hashSlug: fileSlug(file.name, id),
    kind: inferFileKind(guessedMime, file.name),
    data: file.slice(0, file.size, guessedMime || undefined),
  };
};

export async function saveKnowledgeFiles(files: File[], options: { projectId?: string } = {}) {
  if (!files.length) return [];
  const projectId = options.projectId || DEFAULT_PROJECT_ID;
  const existingCount = await countFilesForProject(projectId);
  if (existingCount + files.length > filesPerProjectLimit) {
    throw new Error(
      `Project reached its limit (${existingCount}/${filesPerProjectLimit}). Delete files or create another project.`,
    );
  }
  const db = await openKnowledgeDB();
  const records = files.map((file) => ensureFileRecord(file, projectId));
  const tx = db.transaction(STORE_FILES, "readwrite");
  const store = tx.objectStore(STORE_FILES);
  for (const record of records) {
    store.put(record);
  }
  await txDone(tx);
  return records;
}

export async function updateKnowledgeFileTags(
  fileId: string,
  tags: string[] | undefined,
): Promise<KnowledgeFileRecord> {
  const db = await openKnowledgeDB();
  const tx = db.transaction(STORE_FILES, "readwrite");
  const store = tx.objectStore(STORE_FILES);
  const existing = (await requestResult(store.get(fileId))) as
    | KnowledgeFileRecord
    | undefined;
  if (!existing) {
    throw new Error(`Knowledge file ${fileId} not found`);
  }
  const next: KnowledgeFileRecord = {
    ...existing,
    tags: normalizeTags(tags),
    updatedAt: Date.now(),
  };
  store.put(next);
  await txDone(tx);
  return next;
}

export async function updateKnowledgeFileAnalysis(
  fileId: string,
  options: {
    analysis?: KnowledgeFileAnalysis | null;
    autoTags?: string[] | null;
  },
): Promise<KnowledgeFileRecord> {
  const db = await openKnowledgeDB();
  const tx = db.transaction(STORE_FILES, "readwrite");
  const store = tx.objectStore(STORE_FILES);
  const existing = (await requestResult(store.get(fileId))) as
    | KnowledgeFileRecord
    | undefined;
  if (!existing) {
    throw new Error(`Knowledge file ${fileId} not found`);
  }
  const next: KnowledgeFileRecord = {
    ...existing,
    analysis:
      options.analysis === null ? undefined : options.analysis ?? existing.analysis,
    autoTags:
      options.autoTags === null
        ? undefined
        : normalizeTags(options.autoTags ?? existing.autoTags),
    updatedAt: Date.now(),
  };
  store.put(next);
  await txDone(tx);
  return next;
}

export async function listKnowledgeFiles(): Promise<KnowledgeFileRecord[]> {
  const db = await openKnowledgeDB();
  const tx = db.transaction(STORE_FILES, "readonly");
  const store = tx.objectStore(STORE_FILES);
  const items = await requestResult(store.getAll());
  return (items as KnowledgeFileRecord[]).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listProjects(): Promise<KnowledgeProjectRecord[]> {
  const db = await openKnowledgeDB();
  const tx = db.transaction(STORE_PROJECTS, "readonly");
  const store = tx.objectStore(STORE_PROJECTS);
  const projects = (await requestResult(store.getAll())) as KnowledgeProjectRecord[];
  if (!projects.some((project) => project.id === DEFAULT_PROJECT_ID)) {
    const fallback = defaultProjectRecord();
    const writeTx = db.transaction(STORE_PROJECTS, "readwrite");
    writeTx.objectStore(STORE_PROJECTS).put(fallback);
    await txDone(writeTx);
    projects.push(fallback);
  }
  return projects.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listFilesByProject(projectId: string): Promise<KnowledgeFileRecord[]> {
  const db = await openKnowledgeDB();
  const tx = db.transaction(STORE_FILES, "readonly");
  const store = tx.objectStore(STORE_FILES);
  const index = store.index("projectId");
  const files = await requestResult(index.getAll(IDBKeyRange.only(projectId)));
  return (files as KnowledgeFileRecord[]).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function countFilesForProject(projectId: string): Promise<number> {
  const db = await openKnowledgeDB();
  const tx = db.transaction(STORE_FILES, "readonly");
  const count = await requestResult(tx.objectStore(STORE_FILES).index("projectId").count(IDBKeyRange.only(projectId)));
  return count ?? 0;
}

export async function assignFilesToProject(projectId: string, fileIds: string[]): Promise<void> {
  if (!fileIds.length) return;
  const db = await openKnowledgeDB();
  const tx = db.transaction(STORE_FILES, "readwrite");
  const store = tx.objectStore(STORE_FILES);
  const now = Date.now();
  await Promise.all(
    fileIds.map(async (id) => {
      const existing = (await requestResult(store.get(id))) as KnowledgeFileRecord | undefined;
      if (!existing) return;
      existing.projectId = projectId;
      existing.updatedAt = now;
      store.put(existing);
    }),
  );
  await txDone(tx);
}

const buildPreview = async (record: KnowledgeFileRecord): Promise<string> => {
  if (record.kind === "audio") {
    return `Audio track · ${record.name} · ${formatBytes(record.size)}`;
  }
  if (record.kind === "image") {
    return `Image reference · ${record.name} · ${formatBytes(record.size)}`;
  }
  if (isPdfRecord(record)) {
    const pdfText = await getPdfText(record);
    if (pdfText) {
      return pdfText.slice(0, PREVIEW_CHAR_LIMIT);
    }
    return `PDF document · ${record.name} · ${formatBytes(record.size)}`;
  }
  try {
    const chunk = await record.data.slice(0, PREVIEW_BYTE_LIMIT, record.mime).text();
    const trimmed = chunk.trim().slice(0, PREVIEW_CHAR_LIMIT);
    if (trimmed.length > 0) {
      return trimmed;
    }
  } catch {
    // ignore preview errors
  }
  return `${record.name} · ${formatBytes(record.size)}`;
};

type AttachmentBuildResult = { attachment: KnowledgeFileAttachment; bytesUsed: number } | null;

const buildAttachment = async (record: KnowledgeFileRecord, budgetBytes?: number): Promise<AttachmentBuildResult> => {
  if (typeof budgetBytes === "number" && budgetBytes < MIN_PREVIEW_BUDGET) {
    return null;
  }
  const preview = await buildPreview(record);
  const previewBytes = encoder.encode(preview).length;
  if (typeof budgetBytes === "number" && previewBytes > budgetBytes) {
    return null;
  }
  let contentBase64: string | undefined;
  let contentBytes = 0;
  const canInline =
    record.kind !== "audio" &&
    record.kind !== "image" &&
    record.size <= INLINE_CONTENT_LIMIT &&
    (record.mime.startsWith("text/") || record.mime.includes("json"));
  const remainingAfterPreview = typeof budgetBytes === "number" ? budgetBytes - previewBytes : undefined;
  if (canInline && (remainingAfterPreview === undefined || remainingAfterPreview >= record.size)) {
    const buffer = await record.data.arrayBuffer();
    contentBase64 = arrayBufferToBase64(buffer);
    contentBytes = buffer.byteLength;
  } else if (!contentBase64 && isPdfRecord(record)) {
    const pdfText = await getPdfText(record);
    if (pdfText) {
      const pdfBytes = encoder.encode(pdfText);
      let inlineBytes = pdfBytes;
      if (typeof remainingAfterPreview === "number") {
        const allowed = Math.max(0, remainingAfterPreview);
        if (allowed === 0) {
          inlineBytes = new Uint8Array(0);
        } else if (allowed < pdfBytes.byteLength) {
          inlineBytes = pdfBytes.slice(0, allowed);
        }
      }
      if (inlineBytes.byteLength > 0) {
        contentBase64 = arrayBufferToBase64(inlineBytes.buffer);
        contentBytes = inlineBytes.byteLength;
      }
    }
  }
  return {
    attachment: {
      id: record.id,
      name: record.name,
      mime: record.mime,
      size: record.size,
      hashSlug: record.hashSlug,
      projectId: record.projectId,
      kind: record.kind,
      preview,
      contentBase64,
    },
    bytesUsed: previewBytes + contentBytes,
  };
};

type ExportOptions = {
  maxBytes?: number;
  maxFiles?: number;
};

export async function exportProjectPayload(
  projectId: string,
  options: ExportOptions = {},
): Promise<KnowledgeProjectExport> {
  const db = await openKnowledgeDB();
  const tx = db.transaction(STORE_PROJECTS, "readonly");
  const project = (await requestResult(tx.objectStore(STORE_PROJECTS).get(projectId))) as KnowledgeProjectRecord | undefined;
  tx.abort();
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }
  const files = await listFilesByProject(projectId);
  const maxFiles = options.maxFiles ?? filesPerProjectLimit;
  const resultFiles: KnowledgeFileAttachment[] = [];
  const omitted: string[] = [];
  let approxBytes = 0;
  let remaining = typeof options.maxBytes === "number" ? Math.max(0, options.maxBytes) : undefined;
  for (const record of files) {
    if (resultFiles.length >= maxFiles) {
      omitted.push(record.name);
      continue;
    }
    if (typeof remaining === "number" && remaining <= 0) {
      omitted.push(record.name);
      continue;
    }
    const built = await buildAttachment(record, remaining);
    if (!built) {
      omitted.push(record.name);
      continue;
    }
    resultFiles.push(built.attachment);
    approxBytes += built.bytesUsed;
    if (typeof remaining === "number") {
      remaining = Math.max(0, remaining - built.bytesUsed);
    }
  }
  return {
    project: {
      id: project.id,
      name: project.name,
      tags: project.tags,
      type: project.type,
      hashSlug: project.hashSlug,
    },
    summary: project.meta && typeof project.meta.summary === "string" ? (project.meta.summary as string) : undefined,
    files: resultFiles,
    approxBytes,
    omittedFiles: omitted,
  };
}

export async function deleteKnowledgeFile(id: string) {
  const db = await openKnowledgeDB();
  const tx = db.transaction(STORE_FILES, "readwrite");
  tx.objectStore(STORE_FILES).delete(id);
  await txDone(tx);
}

export async function getProjectBySlug(slug: string): Promise<KnowledgeProjectRecord | null> {
  const db = await openKnowledgeDB();
  const tx = db.transaction(STORE_PROJECTS, "readonly");
  const index = tx.objectStore(STORE_PROJECTS).index("hashSlug");
  const match = (await requestResult(index.get(slug))) as KnowledgeProjectRecord | undefined;
  return match ?? null;
}
