import * as React from "react";
import type { HelixAccountSessionStatus } from "@shared/helix-account-session";
import type {
  HelixWorkspaceMemoryArtifact,
  HelixWorkspaceMemoryRegistrySnapshot,
} from "@shared/helix-workspace-memory-registry";
import type {
  HelixProfileStorageEntry,
  HelixProfileStorageHttpWriteRequest,
  HelixProfileStorageSnapshot,
  HelixProfileStorageWriteReceipt,
} from "@shared/helix-profile-storage";
import { AGI_CHAT_STORAGE_KEY, useAgiChatStore, type ChatSession } from "@/store/useAgiChatStore";
import { useWorkspaceMemoryRegistryStore } from "@/store/useWorkspaceMemoryRegistryStore";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "./accountCapabilityPolicy";
import { pairingRecoveryValueAllowed } from "../agent-access/pairingRecoveryStorage";

const PROFILE_SYNC_INTERVAL_MS = 12000;
const PROFILE_SYNC_DEBOUNCE_MS = 1200;
const PROFILE_RESTORE_TIMEOUT_MS = 8000;
const PROFILE_RESTORE_FAILURE_MESSAGE =
  "Profile restore is unavailable. Backup is paused while recovery retries.";
const DESKTOP_LAYOUT_STORAGE_KEY = "desktop-windows-v2";
const LIVE_SOURCE_ENDPOINT_STORAGE_KEY = "helix.worldEventSourceEndpoint";
const LIVE_SOURCE_LABEL_STORAGE_KEY = "helix.worldEventSourceLabel";
const VISUAL_CAPTURE_ROUTE_STORAGE_KEY = "helix.liveAnswer.visualCaptureRoutes.v1";
const FRUITION_CALCULATOR_STORAGE_KEY = "fruition-calculator:v1";
export const HELIX_PROFILE_STORAGE_ATTACH_CONSENT_EVENT =
  "helix-profile-storage-attach-consent";
const PROFILE_ATTACH_CONSENT_KEY_PREFIX = "helix.profileStorage.attachConsent:";
const PROFILE_SYNC_QUEUE_KEY_PREFIX = "helix.profileStorage.pendingSync:";
const PROFILE_SYNC_STATUS_KEY_PREFIX = "helix.profileStorage.syncStatus:";
export const HELIX_PROFILE_STORAGE_SYNC_STATUS_EVENT =
  "helix-profile-storage-sync-status";

export type HelixProfileStorageSyncStatus = {
  profileId: string;
  pending: boolean;
  pendingEntryCount: number;
  pendingArtifactCount: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
};

type PendingProfileStorageSync = {
  schema: "helix.profile_storage_pending_sync.v1";
  profileId: string;
  queuedAt: string;
  updatedAt: string;
  attemptCount: number;
  payload: {
    entries: HelixProfileStorageEntry[];
    artifacts: HelixWorkspaceMemoryArtifact[];
  };
  comparable: string;
};

const byteLength = (value: string): number => {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).byteLength;
  }
  return value.length * 2;
};

const safeLocalStorageGet = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeLocalStorageSet = (key: string, value: string): boolean => {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const safeLocalStorageRemove = (key: string): boolean => {
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

const safeJsonParse = <T,>(value: string | null): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const nowIso = (): string => new Date().toISOString();

const profileSyncQueueKey = (profileId: string): string =>
  `${PROFILE_SYNC_QUEUE_KEY_PREFIX}${profileId}`;

const profileSyncStatusKey = (profileId: string): string =>
  `${PROFILE_SYNC_STATUS_KEY_PREFIX}${profileId}`;

function dispatchSyncStatus(status: HelixProfileStorageSyncStatus): void {
  window.dispatchEvent(new CustomEvent(HELIX_PROFILE_STORAGE_SYNC_STATUS_EVENT, {
    detail: status,
  }));
}

export function getProfileStorageSyncStatus(
  profileId: string | null | undefined,
): HelixProfileStorageSyncStatus | null {
  if (!profileId?.trim()) return null;
  return safeJsonParse<HelixProfileStorageSyncStatus>(
    safeLocalStorageGet(profileSyncStatusKey(profileId.trim())),
  );
}

function readPendingSync(profileId: string): PendingProfileStorageSync | null {
  const pending = safeJsonParse<PendingProfileStorageSync>(safeLocalStorageGet(profileSyncQueueKey(profileId)));
  return pending?.schema === "helix.profile_storage_pending_sync.v1" ? pending : null;
}

function writeSyncStatus(status: HelixProfileStorageSyncStatus): void {
  if (safeLocalStorageSet(profileSyncStatusKey(status.profileId), JSON.stringify(status))) {
    dispatchSyncStatus(status);
  }
}

function queuePendingSync(input: {
  profileId: string;
  payload: PendingProfileStorageSync["payload"];
  comparable: string;
}): PendingProfileStorageSync {
  const previous = readPendingSync(input.profileId);
  const previousStatus = getProfileStorageSyncStatus(input.profileId);
  const pending: PendingProfileStorageSync = {
    schema: "helix.profile_storage_pending_sync.v1",
    profileId: input.profileId,
    queuedAt: previous?.queuedAt ?? nowIso(),
    updatedAt: nowIso(),
    attemptCount: previous?.attemptCount ?? 0,
    payload: input.payload,
    comparable: input.comparable,
  };
  safeLocalStorageSet(profileSyncQueueKey(input.profileId), JSON.stringify(pending));
  writeSyncStatus({
    profileId: input.profileId,
    pending: true,
    pendingEntryCount: input.payload.entries.length,
    pendingArtifactCount: input.payload.artifacts.length,
    lastAttemptAt: previousStatus?.lastAttemptAt ?? null,
    lastSuccessAt: previousStatus?.lastSuccessAt ?? null,
    lastErrorAt: previousStatus?.lastErrorAt ?? null,
    lastError: previousStatus?.lastError ?? null,
  });
  return pending;
}

function markSyncAttempt(profileId: string, pending: PendingProfileStorageSync): void {
  const status = getProfileStorageSyncStatus(profileId);
  const attemptedAt = nowIso();
  const nextPending = {
    ...pending,
    attemptCount: pending.attemptCount + 1,
    updatedAt: attemptedAt,
  };
  safeLocalStorageSet(profileSyncQueueKey(profileId), JSON.stringify(nextPending));
  writeSyncStatus({
    profileId,
    pending: true,
    pendingEntryCount: pending.payload.entries.length,
    pendingArtifactCount: pending.payload.artifacts.length,
    lastAttemptAt: attemptedAt,
    lastSuccessAt: status?.lastSuccessAt ?? null,
    lastErrorAt: status?.lastErrorAt ?? null,
    lastError: status?.lastError ?? null,
  });
}

function markSyncSuccess(profileId: string): void {
  const status = getProfileStorageSyncStatus(profileId);
  safeLocalStorageRemove(profileSyncQueueKey(profileId));
  writeSyncStatus({
    profileId,
    pending: false,
    pendingEntryCount: 0,
    pendingArtifactCount: 0,
    lastAttemptAt: status?.lastAttemptAt ?? null,
    lastSuccessAt: nowIso(),
    lastErrorAt: null,
    lastError: null,
  });
}

function markSyncFailure(profileId: string, message: string): void {
  const status = getProfileStorageSyncStatus(profileId);
  const pending = readPendingSync(profileId);
  writeSyncStatus({
    profileId,
    pending: true,
    pendingEntryCount: status?.pendingEntryCount ?? pending?.payload.entries.length ?? 0,
    pendingArtifactCount: status?.pendingArtifactCount ?? pending?.payload.artifacts.length ?? 0,
    lastAttemptAt: status?.lastAttemptAt ?? null,
    lastSuccessAt: status?.lastSuccessAt ?? null,
    lastErrorAt: nowIso(),
    lastError: message,
  });
}

export function profileStorageAttachConsentKey(profileId: string): string {
  return `${PROFILE_ATTACH_CONSENT_KEY_PREFIX}${profileId}`;
}

export function isProfileStorageAttachConsentGranted(profileId: string | null | undefined): boolean {
  if (!profileId?.trim()) return false;
  return safeLocalStorageGet(profileStorageAttachConsentKey(profileId.trim())) === "1";
}

export function grantProfileStorageAttachConsent(profileId: string | null | undefined): boolean {
  if (!profileId?.trim()) return false;
  const granted = safeLocalStorageSet(profileStorageAttachConsentKey(profileId.trim()), "1");
  if (granted) {
    window.dispatchEvent(new CustomEvent(HELIX_PROFILE_STORAGE_ATTACH_CONSENT_EVENT, {
      detail: { profileId: profileId.trim(), granted: true },
    }));
  }
  return granted;
}

export function revokeProfileStorageAttachConsent(profileId: string | null | undefined): boolean {
  if (!profileId?.trim()) return false;
  const revoked = safeLocalStorageRemove(profileStorageAttachConsentKey(profileId.trim()));
  if (revoked) {
    window.dispatchEvent(new CustomEvent(HELIX_PROFILE_STORAGE_ATTACH_CONSENT_EVENT, {
      detail: { profileId: profileId.trim(), granted: false },
    }));
  }
  return revoked;
}

export function shouldSaveProfileStorageSnapshot(input: {
  profileId: string | null | undefined;
  registry: HelixWorkspaceMemoryRegistrySnapshot;
}): boolean {
  if (!input.profileId?.trim()) return false;
  if (!isProfileStorageAttachConsentGranted(input.profileId)) return false;
  return profileEligibleArtifacts(input.registry, input.profileId.trim()).length > 0;
}

async function fetchAccountStatus(signal?: AbortSignal): Promise<HelixAccountSessionStatus | null> {
  const response = await fetch("/api/account/session", { signal });
  if (!response.ok) return null;
  return response.json();
}

function syntheticDesktopLayoutArtifact(profileId: string): HelixWorkspaceMemoryArtifact | null {
  const value = safeLocalStorageGet(DESKTOP_LAYOUT_STORAGE_KEY);
  if (value == null) return null;
  return {
    schema: "helix.workspace_memory_registry.v1",
    artifact_id: "workstation-layout:desktop",
    artifact_type: "workstation_layout",
    owner_scope: "profile",
    storage_backend: "localStorage",
    sync_status: "profile_synced",
    profile_id: profileId,
    chat_session_id: null,
    title: "Desktop layout",
    storage_key: DESKTOP_LAYOUT_STORAGE_KEY,
    path_ref: `storage://localStorage/${DESKTOP_LAYOUT_STORAGE_KEY}`,
    size_bytes: byteLength(value),
    quota_bytes: null,
    updated_at: new Date().toISOString(),
  };
}

function syntheticLinkedSourceArtifacts(profileId: string): HelixWorkspaceMemoryArtifact[] {
  const updatedAt = new Date().toISOString();
  return [
    {
      key: LIVE_SOURCE_ENDPOINT_STORAGE_KEY,
      artifact_id: "linked-source:live-answer-world-event-endpoint",
      title: "Live answer world-event endpoint",
    },
    {
      key: LIVE_SOURCE_LABEL_STORAGE_KEY,
      artifact_id: "linked-source:live-answer-world-event-label",
      title: "Live answer world-event label",
    },
    {
      key: VISUAL_CAPTURE_ROUTE_STORAGE_KEY,
      artifact_id: "linked-source:live-answer-visual-capture-routes",
      title: "Live answer visual capture routes",
    },
  ].flatMap((entry): HelixWorkspaceMemoryArtifact[] => {
    const value = safeLocalStorageGet(entry.key);
    if (value == null || value.trim() === "") return [];
    return [{
      schema: "helix.workspace_memory_registry.v1",
      artifact_id: entry.artifact_id,
      artifact_type: "linked_source",
      owner_scope: "profile",
      storage_backend: "localStorage",
      sync_status: "profile_synced",
      profile_id: profileId,
      chat_session_id: null,
      title: entry.title,
      storage_key: entry.key,
      path_ref: `storage://localStorage/${entry.key}`,
      size_bytes: byteLength(value),
      quota_bytes: null,
      updated_at: updatedAt,
    }];
  });
}

function syntheticRememberedProcedureArtifacts(profileId: string): HelixWorkspaceMemoryArtifact[] {
  const value = safeLocalStorageGet(FRUITION_CALCULATOR_STORAGE_KEY);
  if (value == null || value.trim() === "") return [];
  return [{
    schema: "helix.workspace_memory_registry.v1",
    artifact_id: "remembered-procedure:fruition-calculator",
    artifact_type: "remembered_procedure",
    owner_scope: "profile",
    storage_backend: "localStorage",
    sync_status: "profile_synced",
    profile_id: profileId,
    chat_session_id: null,
    title: "Fruition procedure expressions",
    storage_key: FRUITION_CALCULATOR_STORAGE_KEY,
    path_ref: `storage://localStorage/${FRUITION_CALCULATOR_STORAGE_KEY}`,
    size_bytes: byteLength(value),
    quota_bytes: null,
    updated_at: new Date().toISOString(),
  }];
}

function hasRestorableAgiChatSessions(value: string): boolean {
  const parsed = safeJsonParse<{
    state?: { sessions?: unknown };
    sessions?: unknown;
  }>(value);
  const rawSessions = parsed?.state?.sessions ?? parsed?.sessions;
  const sessions = rawSessions && typeof rawSessions === "object"
    ? Array.isArray(rawSessions)
      ? rawSessions
      : Object.values(rawSessions)
    : [];
  return sessions.some((session) =>
    Boolean(
      session &&
      typeof session === "object" &&
      typeof (session as { id?: unknown }).id === "string" &&
      Array.isArray((session as { messages?: unknown }).messages) &&
      ((session as { messages: unknown[] }).messages.length > 0),
    ),
  );
}

function syntheticHelixAskChatArtifacts(profileId: string): HelixWorkspaceMemoryArtifact[] {
  const value = safeLocalStorageGet(AGI_CHAT_STORAGE_KEY);
  if (value == null || value.trim() === "") return [];
  if (!hasRestorableAgiChatSessions(value)) return [];
  return [{
    schema: "helix.workspace_memory_registry.v1",
    artifact_id: "helix-chat-storage:agi-chat-sessions-v1",
    artifact_type: "helix_chat_session",
    owner_scope: "profile",
    storage_backend: "localStorage",
    sync_status: "profile_synced",
    profile_id: profileId,
    chat_session_id: null,
    title: "Helix Ask chats",
    storage_key: AGI_CHAT_STORAGE_KEY,
    path_ref: `storage://localStorage/${AGI_CHAT_STORAGE_KEY}`,
    size_bytes: byteLength(value),
    quota_bytes: null,
    updated_at: new Date().toISOString(),
  }];
}

function excludedProfileStorageKeys(
  artifacts: HelixWorkspaceMemoryArtifact[],
  profileId: string,
): Set<string> {
  // Entries upload entire storage values. One foreign owner blocks the whole
  // key, including synthetic or duplicate registrations of those same bytes.
  return new Set(artifacts
    .filter((artifact) => artifact.storage_backend === "localStorage")
    .filter((artifact) =>
      (artifact.profile_id !== null && artifact.profile_id !== profileId) ||
      (artifact.owner_scope === "profile" && artifact.profile_id !== profileId) ||
      artifact.owner_scope === "surface_session_only",
    )
    .map((artifact) => artifact.storage_key));
}

function profileEligibleArtifacts(
  registry: HelixWorkspaceMemoryRegistrySnapshot,
  profileId: string,
): HelixWorkspaceMemoryArtifact[] {
  const excludedStorageKeys = excludedProfileStorageKeys(registry.artifacts, profileId);
  const artifacts = registry.artifacts
    .filter((artifact) => artifact.storage_backend === "localStorage")
    .filter((artifact) =>
      artifact.sync_status === "profile_candidate" ||
      artifact.sync_status === "profile_synced",
    )
    .map((artifact) => ({
      ...artifact,
      owner_scope: "profile" as const,
      sync_status: "profile_synced" as const,
      profile_id: profileId,
      updated_at: artifact.updated_at || new Date().toISOString(),
    }));
  const desktopLayout = syntheticDesktopLayoutArtifact(profileId);
  return [
    ...artifacts,
    ...(desktopLayout ? [desktopLayout] : []),
    ...syntheticHelixAskChatArtifacts(profileId),
    ...syntheticLinkedSourceArtifacts(profileId),
    ...syntheticRememberedProcedureArtifacts(profileId),
  ].filter((artifact) => !excludedStorageKeys.has(artifact.storage_key) &&
    pairingRecoveryValueAllowed(profileId, artifact.storage_key, safeLocalStorageGet(artifact.storage_key) ?? ""));
}

export function buildProfileStoragePayload(
  registry: HelixWorkspaceMemoryRegistrySnapshot,
  profileId: string,
): { entries: HelixProfileStorageEntry[]; artifacts: HelixWorkspaceMemoryArtifact[] } {
  const artifacts = profileEligibleArtifacts(registry, profileId);
  const artifactIdsByStorageKey = new Map<string, string[]>();
  for (const artifact of artifacts) {
    const ids = artifactIdsByStorageKey.get(artifact.storage_key) ?? [];
    ids.push(artifact.artifact_id);
    artifactIdsByStorageKey.set(artifact.storage_key, Array.from(new Set(ids)).sort());
  }
  const entries: HelixProfileStorageEntry[] = [];
  for (const [storageKey, artifactIds] of artifactIdsByStorageKey.entries()) {
    const value = safeLocalStorageGet(storageKey);
    if (value == null) continue;
    entries.push({
      storage_key: storageKey,
      storage_backend: "localStorage",
      value,
      size_bytes: byteLength(value),
      updated_at: new Date().toISOString(),
      artifact_ids: artifactIds,
    });
  }
  return {
    entries: entries.sort((left, right) => left.storage_key.localeCompare(right.storage_key)),
    artifacts: artifacts.sort((left, right) => left.artifact_id.localeCompare(right.artifact_id)),
  };
}

async function saveProfileStorageSnapshot(
  payload: {
    entries: HelixProfileStorageEntry[];
    artifacts: HelixWorkspaceMemoryArtifact[];
  },
  profileId: string,
  signal?: AbortSignal,
): Promise<HelixProfileStorageWriteReceipt | null> {
  if (payload.entries.length === 0 && payload.artifacts.length === 0) return null;
  const response = await fetch("/api/account/profile-storage/snapshot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, expected_profile_id: profileId } satisfies HelixProfileStorageHttpWriteRequest),
    signal,
  });
  const body = await response.json();
  return body as HelixProfileStorageWriteReceipt;
}

async function flushPendingProfileStorageSync(
  profileId: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean; comparable: string | null }> {
  const pending = readPendingSync(profileId);
  if (!pending) return { ok: true, comparable: null };
  const ownershipMatches = () => {
    const excluded = excludedProfileStorageKeys([
      ...useWorkspaceMemoryRegistryStore.getState().buildRegistrySnapshot().artifacts,
      ...pending.payload.artifacts,
    ], profileId);
    return pending.profileId === profileId &&
      pending.payload.entries.every((entry) => pairingRecoveryValueAllowed(profileId, entry.storage_key, entry.value)) &&
      !pending.payload.entries.some((entry) => excluded.has(entry.storage_key)) &&
      !pending.payload.artifacts.some((artifact) => excluded.has(artifact.storage_key));
  };
  const stillOwnsQueue = () => {
    const current = readPendingSync(profileId);
    return !signal?.aborted && current?.profileId === profileId &&
      current.comparable === pending.comparable &&
      JSON.stringify(current.payload) === JSON.stringify(pending.payload);
  };
  if (!ownershipMatches()) {
    markSyncFailure(profileId, "Profile backup is paused because queued storage ownership changed.");
    return { ok: false, comparable: pending.comparable };
  }
  markSyncAttempt(profileId, pending);
  try {
    const receipt = await saveProfileStorageSnapshot(pending.payload, profileId, signal);
    // A receipt settles only the payload sent, never a replacement queued while
    // the request was in flight. Aborted responses cannot mutate local state.
    if (!stillOwnsQueue()) return { ok: false, comparable: pending.comparable };
    if (!ownershipMatches()) {
      markSyncFailure(profileId, "Profile backup is paused because queued storage ownership changed.");
      return { ok: false, comparable: pending.comparable };
    }
    if (!receipt?.ok) {
      markSyncFailure(profileId, receipt?.message ?? "Profile backup did not complete.");
      return { ok: false, comparable: pending.comparable };
    }
    markSyncSuccess(profileId);
    for (const artifact of pending.payload.artifacts) {
      useWorkspaceMemoryRegistryStore.getState().upsertArtifact({
        ...artifact,
        owner_scope: "profile",
        sync_status: "profile_synced",
        profile_id: profileId,
      });
    }
    return { ok: true, comparable: pending.comparable };
  } catch (err) {
    if (stillOwnsQueue()) {
      markSyncFailure(profileId, err instanceof Error ? err.message : "Profile backup failed.");
    }
    return { ok: false, comparable: pending.comparable };
  }
}

async function loadProfileStorageSnapshot(signal?: AbortSignal): Promise<HelixProfileStorageSnapshot | null> {
  const response = await fetch("/api/account/profile-storage/snapshot", { signal });
  if (!response.ok) return null;
  return response.json();
}

function applyProfileStorageSnapshot(snapshot: HelixProfileStorageSnapshot): number {
  let applied = 0;
  const registry = useWorkspaceMemoryRegistryStore.getState();
  for (const entry of snapshot.entries) {
    if (entry.storage_backend !== "localStorage") continue;
    if (!snapshot.profile_id || !pairingRecoveryValueAllowed(snapshot.profile_id, entry.storage_key, entry.value)) continue;
    const existing = safeLocalStorageGet(entry.storage_key);
    if (existing === entry.value) continue;
    if (safeLocalStorageSet(entry.storage_key, entry.value)) {
      applied += 1;
    }
    if (entry.storage_key === AGI_CHAT_STORAGE_KEY) {
      applyRestoredAgiChatStorageValue(entry.value);
    }
  }
  for (const artifact of snapshot.artifacts) {
    if (!snapshot.profile_id || !pairingRecoveryValueAllowed(snapshot.profile_id, artifact.storage_key,
      safeLocalStorageGet(artifact.storage_key) ?? "")) continue;
    registry.upsertArtifact({
      ...artifact,
      owner_scope: "profile",
      sync_status: "profile_synced",
      profile_id: snapshot.profile_id,
    });
  }
  return applied;
}

function applyRestoredAgiChatStorageValue(value: string): void {
  const parsed = safeJsonParse<{
    state?: {
      sessions?: unknown;
      activeId?: unknown;
    };
    sessions?: unknown;
    activeId?: unknown;
  }>(value);
  const rawSessions = parsed?.state?.sessions ?? parsed?.sessions;
  const sessions = rawSessions && typeof rawSessions === "object"
    ? Array.isArray(rawSessions)
      ? rawSessions
      : Object.values(rawSessions)
    : [];
  const validSessions = sessions.filter((session): session is ChatSession =>
    Boolean(
      session &&
      typeof session === "object" &&
      typeof (session as { id?: unknown }).id === "string" &&
      typeof (session as { title?: unknown }).title === "string",
    ),
  );
  if (validSessions.length === 0) return;
  const activeId = typeof parsed?.state?.activeId === "string"
    ? parsed.state.activeId
    : typeof parsed?.activeId === "string"
      ? parsed.activeId
      : null;
  const store = useAgiChatStore.getState();
  store.mergeSessions(validSessions);
  if (activeId && validSessions.some((session) => session.id === activeId)) {
    store.setActive(activeId);
  }
}

function maybeReloadAfterRestore(profileId: string, appliedCount: number): void {
  if (appliedCount <= 0) return;
  const reloadKey = `helix.profileStorage.restoreReloaded:${profileId}`;
  try {
    if (window.sessionStorage.getItem(reloadKey) === "1") return;
    window.sessionStorage.setItem(reloadKey, "1");
    window.location.reload();
  } catch {
    // Browser storage reload coordination is best-effort.
  }
}

export function useProfileStorageSync(): void {
  const registryArtifacts = useWorkspaceMemoryRegistryStore((state) =>
    state.artifacts,
  );
  const registrySnapshot = React.useMemo(
    () => useWorkspaceMemoryRegistryStore.getState().buildRegistrySnapshot(),
    [registryArtifacts],
  );
  const [profileId, setProfileId] = React.useState<string | null>(null);
  const [attachConsentTick, setAttachConsentTick] = React.useState(0);
  const restoredProfilesRef = React.useRef<Set<string>>(new Set());
  const lastPayloadRef = React.useRef<string>("");
  const [restoreTick, setRestoreTick] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    let generation = 0;
    let controller: AbortController | undefined;
    const refresh = async () => {
      const requestGeneration = ++generation;
      controller?.abort();
      const attempt = new AbortController();
      controller = attempt;
      try {
        const status = await fetchAccountStatus(attempt.signal);
        if (!active || requestGeneration !== generation || attempt.signal.aborted) return;
        setProfileId(status?.session?.profile.profile_id ?? null);
      } catch {
        if (!active || requestGeneration !== generation || attempt.signal.aborted) return;
        setProfileId(null);
      }
    };
    const accountChanged = () => {
      // Events invalidate prior work; only the authenticated read selects an owner.
      setProfileId(null);
      void refresh();
    };
    void refresh();
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, accountChanged);
    const timer = window.setInterval(refresh, PROFILE_SYNC_INTERVAL_MS);
    return () => {
      active = false;
      generation++;
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, accountChanged);
    };
  }, []);

  React.useEffect(() => {
    const handleConsent = () => setAttachConsentTick((tick) => tick + 1);
    window.addEventListener(HELIX_PROFILE_STORAGE_ATTACH_CONSENT_EVENT, handleConsent);
    return () => window.removeEventListener(HELIX_PROFILE_STORAGE_ATTACH_CONSENT_EVENT, handleConsent);
  }, []);

  React.useEffect(() => {
    if (!profileId) return;
    if (isProfileStorageAttachConsentGranted(profileId)) return;
    grantProfileStorageAttachConsent(profileId);
  }, [profileId]);

  React.useEffect(() => {
    if (!profileId) return;
    let active = true;
    let controller: AbortController | undefined;
    let timeout: number | undefined;
    let retry: number | undefined;
    restoredProfilesRef.current.delete(profileId);
    const restore = async () => {
      controller = new AbortController();
      const attempt = controller;
      try {
        const snapshot = await Promise.race([
          loadProfileStorageSnapshot(attempt.signal),
          new Promise<never>((_, reject) => {
            timeout = window.setTimeout(() => {
              attempt.abort();
              reject(new Error("profile_restore_timeout"));
            }, PROFILE_RESTORE_TIMEOUT_MS);
          }),
        ]);
        if (!active || attempt.signal.aborted) return;
        if (!snapshot || snapshot.profile_id !== profileId) {
          throw new Error("profile_restore_unavailable");
        }
        const appliedCount = applyProfileStorageSnapshot(snapshot);
        const previousStatus = getProfileStorageSyncStatus(profileId);
        if (previousStatus?.lastError === PROFILE_RESTORE_FAILURE_MESSAGE) {
          const pending = readPendingSync(profileId);
          writeSyncStatus({ ...previousStatus, pending: Boolean(pending),
            pendingEntryCount: pending?.payload.entries.length ?? 0,
            pendingArtifactCount: pending?.payload.artifacts.length ?? 0,
            lastError: null, lastErrorAt: null });
        }
        restoredProfilesRef.current.add(profileId);
        setRestoreTick((tick) => tick + 1);
        maybeReloadAfterRestore(profileId, appliedCount);
      } catch {
        if (!active) return;
        // A fresh origin is not an empty server profile. Do not overwrite the
        // durable snapshot until its current contents have actually been read.
        markSyncFailure(profileId, PROFILE_RESTORE_FAILURE_MESSAGE);
        retry = window.setTimeout(() => { void restore(); }, PROFILE_SYNC_INTERVAL_MS);
      } finally {
        window.clearTimeout(timeout);
      }
    };
    void restore();
    return () => {
      active = false;
      controller?.abort();
      window.clearTimeout(timeout);
      window.clearTimeout(retry);
      restoredProfilesRef.current.delete(profileId);
    };
  }, [profileId]);

  React.useEffect(() => {
    if (!profileId) return;
    if (!restoredProfilesRef.current.has(profileId)) return;
    const payload = buildProfileStoragePayload(registrySnapshot, profileId);
    const pending = readPendingSync(profileId);
    if (
      payload.entries.length === 0 &&
      payload.artifacts.length === 0 &&
      !pending
    ) {
      return;
    }
    if (!isProfileStorageAttachConsentGranted(profileId) && !pending) return;
    const comparable = JSON.stringify({
      profileId,
      entries: payload.entries.map((entry) => ({
        storage_key: entry.storage_key,
        size_bytes: entry.size_bytes,
        value: entry.value,
      })),
      artifacts: payload.artifacts.map((artifact) => ({
        artifact_id: artifact.artifact_id,
        storage_key: artifact.storage_key,
        size_bytes: artifact.size_bytes ?? null,
      })),
    });
    if (!pending && comparable === lastPayloadRef.current) return;
    if (pending?.comparable === comparable && comparable === lastPayloadRef.current) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      if (payload.entries.length > 0 || payload.artifacts.length > 0) {
        queuePendingSync({ profileId, payload, comparable });
      }
      void flushPendingProfileStorageSync(profileId, controller.signal).then((result) => {
        if (result.ok && result.comparable) {
          lastPayloadRef.current = result.comparable;
        }
      });
    }, PROFILE_SYNC_DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [attachConsentTick, profileId, registrySnapshot, restoreTick]);

  React.useEffect(() => {
    if (!profileId) return;
    const controller = new AbortController();
    const retryPending = () => {
      if (!restoredProfilesRef.current.has(profileId)) return;
      if (!readPendingSync(profileId)) return;
      void flushPendingProfileStorageSync(profileId, controller.signal).then((result) => {
        if (result.ok && result.comparable) {
          lastPayloadRef.current = result.comparable;
        }
      });
    };
    const timer = window.setInterval(retryPending, PROFILE_SYNC_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [profileId]);
}
