import { createWithEqualityFn } from "zustand/traditional";
import { persist } from "zustand/middleware";
import {
  HELIX_WORKSPACE_MEMORY_REGISTRY_SCHEMA,
  type HelixWorkspaceMemoryArtifact,
  type HelixWorkspaceMemoryArtifactType,
  type HelixWorkspaceMemoryOwnerScope,
  type HelixWorkspaceMemoryRegistrySnapshot,
  type HelixWorkspaceMemoryStorageBackend,
  type HelixWorkspaceMemorySyncStatus,
} from "@shared/helix-workspace-memory-registry";

type UpsertWorkspaceMemoryArtifactInput = {
  artifact_id: string;
  artifact_type: HelixWorkspaceMemoryArtifactType;
  storage_key: string;
  storage_backend: HelixWorkspaceMemoryStorageBackend;
  owner_scope?: HelixWorkspaceMemoryOwnerScope;
  sync_status?: HelixWorkspaceMemorySyncStatus;
  profile_id?: string | null;
  chat_session_id?: string | null;
  title?: string | null;
  path_ref?: string | null;
  size_bytes?: number | null;
  quota_bytes?: number | null;
  updated_at?: string;
};

type WorkspaceMemoryRegistryState = {
  artifacts: Record<string, HelixWorkspaceMemoryArtifact>;
  upsertArtifact: (artifact: UpsertWorkspaceMemoryArtifactInput) => void;
  removeArtifact: (artifactId: string) => void;
  listArtifacts: () => HelixWorkspaceMemoryArtifact[];
  buildRegistrySnapshot: () => HelixWorkspaceMemoryRegistrySnapshot;
};

const STORAGE_KEY = "helix-workspace-memory-registry:v1";

function defaultOwnerScope(
  storageBackend: HelixWorkspaceMemoryStorageBackend,
): HelixWorkspaceMemoryOwnerScope {
  return storageBackend === "sessionStorage" ? "surface_session_only" : "browser_guest";
}

function defaultSyncStatus(
  ownerScope: HelixWorkspaceMemoryOwnerScope,
): HelixWorkspaceMemorySyncStatus {
  return ownerScope === "profile" ? "profile_synced" : "local_only";
}

function normalizeArtifact(
  input: UpsertWorkspaceMemoryArtifactInput,
): HelixWorkspaceMemoryArtifact | null {
  const artifactId = input.artifact_id.trim();
  const storageKey = input.storage_key.trim();
  if (!artifactId || !storageKey) return null;
  const ownerScope = input.owner_scope ?? defaultOwnerScope(input.storage_backend);
  return {
    schema: HELIX_WORKSPACE_MEMORY_REGISTRY_SCHEMA,
    artifact_id: artifactId,
    artifact_type: input.artifact_type,
    owner_scope: ownerScope,
    storage_backend: input.storage_backend,
    sync_status: input.sync_status ?? defaultSyncStatus(ownerScope),
    profile_id: input.profile_id?.trim() || null,
    chat_session_id: input.chat_session_id?.trim() || null,
    title: input.title ?? null,
    storage_key: storageKey,
    path_ref: input.path_ref?.trim() || null,
    size_bytes: typeof input.size_bytes === "number" && Number.isFinite(input.size_bytes) && input.size_bytes >= 0
      ? Math.round(input.size_bytes)
      : null,
    quota_bytes: typeof input.quota_bytes === "number" && Number.isFinite(input.quota_bytes) && input.quota_bytes >= 0
      ? Math.round(input.quota_bytes)
      : null,
    updated_at: input.updated_at ?? new Date().toISOString(),
  };
}

export const useWorkspaceMemoryRegistryStore = createWithEqualityFn<WorkspaceMemoryRegistryState>()(
  persist(
    (set, get) => ({
      artifacts: {},
      upsertArtifact: (input) => {
        const artifact = normalizeArtifact(input);
        if (!artifact) return;
        set((state) => ({
          artifacts: {
            ...state.artifacts,
            [artifact.artifact_id]: artifact,
          },
        }));
      },
      removeArtifact: (artifactId) => {
        const key = artifactId.trim();
        if (!key) return;
        set((state) => {
          if (!state.artifacts[key]) return state;
          const artifacts = { ...state.artifacts };
          delete artifacts[key];
          return { artifacts };
        });
      },
      listArtifacts: () =>
        Object.values(get().artifacts).sort((a, b) => {
          const bTime = Date.parse(b.updated_at);
          const aTime = Date.parse(a.updated_at);
          return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
        }),
      buildRegistrySnapshot: () => {
        const artifacts = get().listArtifacts();
        return {
          schema: HELIX_WORKSPACE_MEMORY_REGISTRY_SCHEMA,
          artifacts,
          profile_ready_artifact_count: artifacts.filter(
            (artifact) => artifact.sync_status === "profile_candidate",
          ).length,
          local_only_artifact_count: artifacts.filter(
            (artifact) => artifact.sync_status === "local_only",
          ).length,
          session_only_artifact_count: artifacts.filter(
            (artifact) => artifact.owner_scope === "surface_session_only",
          ).length,
        };
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        artifacts: state.artifacts,
      }),
    },
  ),
);
