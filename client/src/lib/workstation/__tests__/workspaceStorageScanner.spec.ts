import { describe, expect, it, vi } from "vitest";
import {
  HELIX_WORKSPACE_MEMORY_REGISTRY_SCHEMA,
  type HelixWorkspaceMemoryRegistrySnapshot,
} from "@shared/helix-workspace-memory-registry";
import { buildBrowserWorkspaceStorageStatus } from "@/lib/workstation/workspaceStorageScanner";

const storage = (entries: Record<string, string>): Storage => {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  } as Storage;
};

describe("workspace storage scanner", () => {
  it("builds browser storage rows without including raw values or local paths", () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    vi.stubGlobal("window", {
      localStorage: storage({
        "workstation-notes:v1": "SECRET_NOTE_BODY_SHOULD_NOT_LEAK",
        "C:\\Users\\dan\\secret-path": "path value",
      }),
      sessionStorage: storage({
        "workstation-session-memory:v1": "draft text that should stay local",
      }),
    });

    const registry: HelixWorkspaceMemoryRegistrySnapshot = {
      schema: HELIX_WORKSPACE_MEMORY_REGISTRY_SCHEMA,
      artifacts: [
        {
          schema: HELIX_WORKSPACE_MEMORY_REGISTRY_SCHEMA,
          artifact_id: "workstation-note:note:1",
          artifact_type: "workstation_note",
          owner_scope: "browser_guest",
          storage_backend: "localStorage",
          sync_status: "profile_candidate",
          profile_id: null,
          chat_session_id: null,
          title: "Saved note",
          storage_key: "workstation-notes:v1",
          updated_at: "2026-06-12T12:00:00.000Z",
        },
      ],
      profile_ready_artifact_count: 1,
      local_only_artifact_count: 0,
      session_only_artifact_count: 0,
    };

    try {
      const status = buildBrowserWorkspaceStorageStatus({
        registry,
        now: new Date("2026-06-12T12:00:00.000Z"),
      });
      const serialized = JSON.stringify(status);

      expect(status.schema_version).toBe("helix.workspace_storage_status.v1");
      expect(status.authority.terminal_eligible).toBe(false);
      expect(status.records.find((record) => record.artifact_id === "workstation-note:note:1")).toMatchObject({
        label: "Saved note",
        storage_backend: "localStorage",
        observed: true,
        authority: {
          assistant_answer: false,
          raw_content_included: false,
          terminal_eligible: false,
        },
      });
      expect(status.summary.total_observed_bytes).toBeGreaterThan(0);
      expect(serialized).not.toContain("SECRET_NOTE_BODY_SHOULD_NOT_LEAK");
      expect(serialized).not.toContain("draft text that should stay local");
      expect(serialized).not.toContain("C:\\Users\\dan\\secret-path");
      expect(serialized).toContain("storage://local-path-redacted/");
    } finally {
      if (originalWindow === undefined) {
        vi.unstubAllGlobals();
      } else {
        vi.stubGlobal("window", originalWindow);
      }
    }
  });
});
