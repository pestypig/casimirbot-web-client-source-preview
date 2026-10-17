import {
  HELIX_WORKSPACE_STORAGE_STATUS_SCHEMA,
  buildHelixWorkspaceStorageAuthority,
  sortHelixWorkspaceStorageRecords,
  summarizeHelixWorkspaceStorage,
  withHelixWorkspaceStorageAuthority,
  type HelixWorkspaceStorageRecord,
  type HelixWorkspaceStorageStatus,
} from "@shared/helix-workspace-storage-status";
import type {
  HelixWorkspaceMemoryArtifact,
  HelixWorkspaceMemoryRegistrySnapshot,
  HelixWorkspaceMemoryStorageBackend,
} from "@shared/helix-workspace-memory-registry";

const DEFAULT_LOCAL_STORAGE_SOFT_LIMIT_BYTES = 5 * 1024 * 1024;
const DEFAULT_SESSION_STORAGE_SOFT_LIMIT_BYTES = 5 * 1024 * 1024;

const byteLength = (value: string): number => {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).byteLength;
  }
  return value.length * 2;
};

const stableHash = (value: string): string => {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
};

const safePathRef = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "storage://unknown";
  if (/^[A-Za-z]:[\\/]/.test(trimmed) || /^\\\\/.test(trimmed)) {
    return `storage://local-path-redacted/${stableHash(trimmed)}`;
  }
  return trimmed.length > 180 ? `${trimmed.slice(0, 176)}...` : trimmed;
};

const getStorageQuota = (backend: HelixWorkspaceMemoryStorageBackend): number | null => {
  if (backend === "localStorage") return DEFAULT_LOCAL_STORAGE_SOFT_LIMIT_BYTES;
  if (backend === "sessionStorage") return DEFAULT_SESSION_STORAGE_SOFT_LIMIT_BYTES;
  return null;
};

const getStorage = (backend: HelixWorkspaceMemoryStorageBackend): Storage | null => {
  if (typeof window === "undefined") return null;
  if (backend === "localStorage") return window.localStorage;
  if (backend === "sessionStorage") return window.sessionStorage;
  return null;
};

const getStorageItemSize = (
  storage: Storage | null,
  key: string,
): { sizeBytes: number | null; failureReason: string | null } => {
  if (!storage) return { sizeBytes: null, failureReason: "storage_backend_not_available_in_this_context" };
  try {
    const value = storage.getItem(key);
    if (value == null) return { sizeBytes: null, failureReason: "storage_key_missing" };
    return { sizeBytes: byteLength(key) + byteLength(value), failureReason: null };
  } catch (error) {
    return {
      sizeBytes: null,
      failureReason: error instanceof Error ? error.message : "storage_read_failed",
    };
  }
};

const recordFromArtifact = (
  artifact: HelixWorkspaceMemoryArtifact,
): HelixWorkspaceStorageRecord => {
  const storage = getStorage(artifact.storage_backend);
  const measured = getStorageItemSize(storage, artifact.storage_key);
  const quotaBytes = artifact.quota_bytes ?? getStorageQuota(artifact.storage_backend);
  const sizeBytes = artifact.size_bytes ?? measured.sizeBytes;
  return withHelixWorkspaceStorageAuthority({
    artifact_id: artifact.artifact_id,
    label: artifact.title ?? artifact.artifact_type.replace(/_/g, " "),
    artifact_type: artifact.artifact_type,
    owner_scope: artifact.owner_scope,
    storage_backend: artifact.storage_backend,
    sync_status: artifact.sync_status,
    status: measured.failureReason === "storage_read_failed" ? "error" : measured.failureReason === "storage_key_missing" ? "configured_missing" : "available",
    path_ref: safePathRef(artifact.path_ref ?? `storage://${artifact.storage_backend}/${artifact.storage_key}`),
    storage_key: safePathRef(artifact.storage_key),
    profile_id: artifact.profile_id,
    chat_session_id: artifact.chat_session_id,
    size_bytes: sizeBytes,
    quota_bytes: quotaBytes,
    usage_ratio: sizeBytes != null && quotaBytes ? sizeBytes / quotaBytes : null,
    approximate: true,
    observed: measured.sizeBytes != null,
    updated_at: artifact.updated_at,
    missing_reason: measured.failureReason === "storage_key_missing" ? measured.failureReason : null,
    failure_reason: measured.failureReason && measured.failureReason !== "storage_key_missing" ? measured.failureReason : null,
    diagnostics: {
      source: "workspace_memory_registry",
      raw_value_included: false,
      key_bytes_included_in_size: true,
    },
  });
};

const storageKeys = (storage: Storage | null): string[] => {
  if (!storage) return [];
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key) keys.push(key);
    }
  } catch {
    return [];
  }
  return keys.sort((left, right) => left.localeCompare(right));
};

const recordFromUnregisteredKey = (
  backend: "localStorage" | "sessionStorage",
  key: string,
): HelixWorkspaceStorageRecord => {
  const measured = getStorageItemSize(getStorage(backend), key);
  const quotaBytes = getStorageQuota(backend);
  const safeKey = safePathRef(key);
  return withHelixWorkspaceStorageAuthority({
    artifact_id: `browser.${backend}.${stableHash(key)}`,
    label: safeKey,
    artifact_type: "browser_storage_key",
    owner_scope: backend === "sessionStorage" ? "surface_session_only" : "browser_guest",
    storage_backend: backend,
    sync_status: "local_only",
    status: measured.failureReason ? "unknown" : "available",
    path_ref: safePathRef(`storage://${backend}/${key}`),
    storage_key: safeKey,
    profile_id: null,
    chat_session_id: null,
    size_bytes: measured.sizeBytes,
    quota_bytes: quotaBytes,
    usage_ratio: measured.sizeBytes != null && quotaBytes ? measured.sizeBytes / quotaBytes : null,
    approximate: true,
    observed: measured.sizeBytes != null,
    updated_at: new Date().toISOString(),
    missing_reason: measured.failureReason,
    diagnostics: {
      source: "browser_storage_enumeration",
      registered_workspace_memory_artifact: false,
      raw_value_included: false,
    },
  });
};

export function buildBrowserWorkspaceStorageStatus(input: {
  registry: HelixWorkspaceMemoryRegistrySnapshot;
  serverStatus?: HelixWorkspaceStorageStatus | null;
  thread_id?: string | null;
  room_id?: string | null;
  now?: Date;
}): HelixWorkspaceStorageStatus {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const recordsById = new Map<string, HelixWorkspaceStorageRecord>();
  for (const record of input.serverStatus?.records ?? []) {
    recordsById.set(record.artifact_id, record);
  }

  const registeredStorageKeys = new Set<string>();
  for (const artifact of input.registry.artifacts) {
    recordsById.set(artifact.artifact_id, recordFromArtifact(artifact));
    registeredStorageKeys.add(`${artifact.storage_backend}:${artifact.storage_key}`);
  }

  for (const backend of ["localStorage", "sessionStorage"] as const) {
    for (const key of storageKeys(getStorage(backend))) {
      if (registeredStorageKeys.has(`${backend}:${key}`)) continue;
      recordsById.set(`browser.${backend}.${stableHash(key)}`, recordFromUnregisteredKey(backend, key));
    }
  }

  const records = sortHelixWorkspaceStorageRecords([...recordsById.values()]);
  const quota =
    records.find((record) => record.storage_backend === "profile_server" && record.quota_bytes != null)?.quota_bytes ??
    records.find((record) => record.storage_backend === "replit_app_storage" && record.quota_bytes != null)?.quota_bytes ??
    null;

  return {
    schema_version: HELIX_WORKSPACE_STORAGE_STATUS_SCHEMA,
    generated_at: generatedAt,
    thread_id: input.thread_id ?? input.serverStatus?.thread_id ?? null,
    room_id: input.room_id ?? input.serverStatus?.room_id ?? null,
    records,
    summary: summarizeHelixWorkspaceStorage(records, quota),
    authority: buildHelixWorkspaceStorageAuthority(),
  };
}
