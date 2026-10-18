/* @vitest-environment jsdom */

import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HelixWorkspaceMemoryRegistrySnapshot } from "@shared/helix-workspace-memory-registry";
import {
  buildProfileStoragePayload,
  getProfileStorageSyncStatus,
  grantProfileStorageAttachConsent,
  HELIX_PROFILE_STORAGE_ATTACH_CONSENT_EVENT,
  isProfileStorageAttachConsentGranted,
  profileStorageAttachConsentKey,
  revokeProfileStorageAttachConsent,
  shouldSaveProfileStorageSnapshot,
  useProfileStorageSync,
} from "../profileStorageSync";
import { useWorkspaceMemoryRegistryStore } from "@/store/useWorkspaceMemoryRegistryStore";
import { useAgiChatStore } from "@/store/useAgiChatStore";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "../accountCapabilityPolicy";

const profileId = "user:test-profile";
const emptyRegistry = (): HelixWorkspaceMemoryRegistrySnapshot => ({
  schema: "helix.workspace_memory_registry.v1",
  artifacts: [],
  local_only_artifact_count: 0,
  profile_ready_artifact_count: 0,
  session_only_artifact_count: 0,
});

const registryWithProfileCandidate = (): HelixWorkspaceMemoryRegistrySnapshot => ({
  schema: "helix.workspace_memory_registry.v1",
  artifacts: [{
    schema: "helix.workspace_memory_registry.v1",
    artifact_id: "artifact:chat",
    artifact_type: "helix_chat_session",
    owner_scope: "browser_guest",
    storage_backend: "localStorage",
    sync_status: "profile_candidate",
    profile_id: null,
    chat_session_id: "chat:test",
    title: "Browser chat",
    storage_key: "agi-chat-sessions-v1",
    updated_at: "2026-07-06T12:00:00.000Z",
  }],
  local_only_artifact_count: 0,
  profile_ready_artifact_count: 1,
  session_only_artifact_count: 0,
});

afterEach(() => {
  cleanup();
  useAgiChatStore.setState({ sessions: {}, activeId: undefined, hydrated: false });
  useWorkspaceMemoryRegistryStore.setState({ artifacts: {} });
  window.localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function ProfileStorageSyncHarness() {
  useProfileStorageSync();
  return null;
}

describe("O5 profile recovery before backup", () => {
  it.each(["success", "failure", "network failure"])("O5 recovery: an older interval upload %s cannot change a newer failed backup", async (olderOutcome) => {
    vi.useFakeTimers();
    const candidate = { ...registryWithProfileCandidate().artifacts[0], storage_key: "fixture:inflight" };
    localStorage.setItem(candidate.storage_key, "first");
    useWorkspaceMemoryRegistryStore.getState().upsertArtifact(candidate);
    let posts = 0;
    let finishOlder!: (response: Response) => void;
    let rejectOlder!: (error: Error) => void;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/account/session") return new Response(JSON.stringify({ session: { profile: { profile_id: profileId } } }));
      if (init?.method === "POST") {
        if (++posts === 2) return new Promise<Response>((resolve, reject) => { finishOlder = resolve; rejectOlder = reject; });
        return new Response(JSON.stringify({ ok: false, message: "fixture offline" }), { status: 503 });
      }
      return new Response(JSON.stringify({ profile_id: profileId, entries: [], artifacts: [] }));
    }));
    render(React.createElement(ProfileStorageSyncHarness));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(12_000); });
    expect(posts).toBe(2);
    await act(async () => {
      localStorage.setItem(candidate.storage_key, "second");
      useWorkspaceMemoryRegistryStore.getState().upsertArtifact({ ...candidate, title: "newer metadata" });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(posts).toBe(3);
    const queueKey = `helix.profileStorage.pendingSync:${profileId}`;
    const newerQueue = localStorage.getItem(queueKey);
    expect(newerQueue).toContain("second");
    await act(async () => {
      if (olderOutcome === "network failure") rejectOlder(new Error("stale network failure"));
      else finishOlder(new Response(JSON.stringify({ ok: olderOutcome === "success", message: "stale response" })));
    });
    expect(localStorage.getItem(queueKey)).toBe(newerQueue);
    expect(getProfileStorageSyncStatus(profileId)).toMatchObject({ pending: true, lastError: "fixture offline" });
    expect(useWorkspaceMemoryRegistryStore.getState().buildRegistrySnapshot().artifacts
      .find(artifact => artifact.artifact_id === candidate.artifact_id)?.title).toBe("newer metadata");
  });

  it("O5 recovery: account events invalidate an old restore before authenticated identity returns", async () => {
    vi.useFakeTimers();
    let accountReads = 0;
    let finishAccount!: (response: Response) => void;
    let finishOldRestore!: (response: Response) => void;
    let restoreSignal: AbortSignal | undefined;
    const newProfile = "profile:next-account";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/account/session") {
        if (++accountReads === 1) return new Response(JSON.stringify({ session: { profile: { profile_id: profileId } } }));
        return new Promise<Response>(resolve => { finishAccount = resolve; });
      }
      if (!restoreSignal) {
        restoreSignal = init?.signal ?? undefined;
        return new Promise<Response>(resolve => { finishOldRestore = resolve; });
      }
      return new Response(JSON.stringify({ profile_id: newProfile, entries: [], artifacts: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(React.createElement(ProfileStorageSyncHarness));
    await act(async () => { await Promise.resolve(); });
    expect(restoreSignal?.aborted).toBe(false);
    await act(async () => {
      window.dispatchEvent(new CustomEvent(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,
        { detail: { profileId: "profile:forged-event" } }));
    });
    expect(accountReads).toBe(2);
    expect(restoreSignal?.aborted).toBe(true);
    await act(async () => {
      finishOldRestore(new Response(JSON.stringify({ profile_id: profileId,
        entries: [{ storage_backend: "localStorage", storage_key: "fixture:stale-account", value: "old" }], artifacts: [] })));
      finishAccount(new Response(JSON.stringify({ session: { profile: { profile_id: newProfile } } })));
    });
    expect(localStorage.getItem("fixture:stale-account")).toBeNull();
    expect(isProfileStorageAttachConsentGranted("profile:forged-event")).toBe(false);
    expect(isProfileStorageAttachConsentGranted(newProfile)).toBe(true);
    view.unmount();
    const before = fetchMock.mock.calls.length;
    window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT));
    expect(fetchMock).toHaveBeenCalledTimes(before);
  });

  it("O5 identity: retains a queued backup without sending it after its storage owner changes", async () => {
    vi.useFakeTimers();
    const candidate = { ...registryWithProfileCandidate().artifacts[0], storage_key: "fixture:queued-preferences" };
    localStorage.setItem(candidate.storage_key, "retained fixture content");
    useWorkspaceMemoryRegistryStore.getState().upsertArtifact(candidate);
    const posts: unknown[] = [];
    let offline = true;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/account/session") return new Response(JSON.stringify({ session: { profile: { profile_id: profileId } } }));
      if (init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ ok: !offline, message: offline ? "fixture offline" : "saved" }), { status: offline ? 503 : 200 });
      }
      return new Response(JSON.stringify({ profile_id: profileId, entries: [], artifacts: [] }));
    }));
    render(React.createElement(ProfileStorageSyncHarness));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(posts).toHaveLength(1);
    await act(async () => {
      useWorkspaceMemoryRegistryStore.getState().upsertArtifact({ ...candidate,
        owner_scope: "profile", profile_id: "profile:other", sync_status: "profile_synced" });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(24_000); });
    expect(posts).toHaveLength(1);
    expect(getProfileStorageSyncStatus(profileId)).toMatchObject({ pending: true,
      lastError: "Profile backup is paused because queued storage ownership changed." });
    expect(localStorage.getItem(candidate.storage_key)).toBe("retained fixture content");
    offline = false;
    await act(async () => {
      useWorkspaceMemoryRegistryStore.getState().upsertArtifact({ ...candidate,
        owner_scope: "profile", profile_id: profileId, sync_status: "profile_synced" });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(posts).toHaveLength(2);
    expect(getProfileStorageSyncStatus(profileId)).toMatchObject({ pending: false, lastError: null });
  });

  it("O5 identity: keeps guest and current-owner candidates but excludes unresolved and session-only ownership", () => {
    const registry = registryWithProfileCandidate();
    const base = registry.artifacts[0];
    registry.artifacts = [
      { ...base, artifact_id: "guest", storage_key: "fixture:guest" },
      { ...base, artifact_id: "current", storage_key: "fixture:current", owner_scope: "profile", profile_id: profileId },
      { ...base, artifact_id: "unresolved", storage_key: "fixture:unresolved", owner_scope: "profile" },
      { ...base, artifact_id: "session", storage_key: "fixture:session", owner_scope: "surface_session_only" },
    ];
    for (const artifact of registry.artifacts) localStorage.setItem(artifact.storage_key, artifact.artifact_id);
    const payload = buildProfileStoragePayload(registry, profileId);
    expect(payload.entries.map(entry => entry.storage_key).sort()).toEqual(["fixture:current", "fixture:guest"]);
    expect(payload.artifacts.every(artifact => artifact.profile_id === profileId)).toBe(true);
  });

  for (const storageKey of ["fixture:agent-preferences", "agi-chat-sessions-v1"]) {
    it(`O5 identity: excludes another profile's ${storageKey} without relabeling or deleting it`, () => {
      const registry = registryWithProfileCandidate();
      registry.artifacts[0] = { ...registry.artifacts[0], storage_key: storageKey,
        owner_scope: "profile", profile_id: "profile:other", sync_status: "profile_synced" };
      localStorage.setItem(storageKey, JSON.stringify({ fixture: "other profile content" }));
      const original = JSON.stringify(registry);
      const payload = buildProfileStoragePayload(registry, profileId);
      expect(payload.entries.some(entry => entry.storage_key === storageKey)).toBe(false);
      expect(payload.artifacts.some(artifact => artifact.storage_key === storageKey)).toBe(false);
      expect(JSON.stringify(registry)).toBe(original);
      expect(localStorage.getItem(storageKey)).toContain("other profile content");

      // A second registration for the same bytes cannot make their ownership safe.
      registry.artifacts.push({ ...registry.artifacts[0], artifact_id: "artifact:current",
        profile_id: profileId });
      expect(buildProfileStoragePayload(registry, profileId).entries
        .some(entry => entry.storage_key === storageKey)).toBe(false);
    });
  }

  for (const lateResult of ["success", "failure"] as const) {
  it(`ignores an old account ${lateResult} after a newer account has been observed`, async () => {
    vi.useFakeTimers();
    let finishOldAccount!: (value: Response) => void;
    let rejectOldAccount!: (error: Error) => void;
    const oldAccount = new Promise<Response>((resolve, reject) => { finishOldAccount = resolve; rejectOldAccount = reject; });
    let oldSignal: AbortSignal | undefined;
    let accountReads = 0;
    let snapshotReads = 0;
    const currentOwner = "profile:new-account";
    const staleOwner = "profile:old-account";
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/account/session") {
        if (++accountReads === 1) { oldSignal = init?.signal ?? undefined; return oldAccount; }
        return new Response(JSON.stringify({ session: { profile: { profile_id: currentOwner } } }));
      }
      snapshotReads++;
      return new Response(JSON.stringify({ profile_id: currentOwner, entries: [], artifacts: [] }));
    }));
    render(React.createElement(ProfileStorageSyncHarness));
    await act(async () => { await vi.advanceTimersByTimeAsync(12_000); });
    await act(async () => { await Promise.resolve(); });
    expect(snapshotReads).toBe(1);
    expect(oldSignal?.aborted).toBe(true);
    expect(isProfileStorageAttachConsentGranted(currentOwner)).toBe(true);
    await act(async () => {
      if (lateResult === "success") finishOldAccount(new Response(JSON.stringify({ session: { profile: { profile_id: staleOwner } } })));
      else rejectOldAccount(new Error("fixture old response failed"));
      await Promise.resolve();
    });
    expect(snapshotReads).toBe(1);
    expect(isProfileStorageAttachConsentGranted(staleOwner)).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(12_000); });
    await act(async () => { await Promise.resolve(); });
    expect(snapshotReads).toBe(1);
  });
  }

  for (const failure of ["unavailable", "wrong_profile", "hung_body"] as const) {
    it(`blocks backup after ${failure}, then retries restoration before saving`, async () => {
      vi.useFakeTimers();
      useAgiChatStore.getState().newSession("Fresh unsynced chat");
      let failRestore = true;
      let restoreReads = 0;
      let finishLateBody: ((value: unknown) => void) | undefined;
      const posts: unknown[] = [];
      const snapshot = (owner = profileId) => ({
        schema: "helix.profile_storage_snapshot.v1", profile_id: owner,
        storage_backend: "profile_server", entries: [], artifacts: [],
        total_entry_bytes: 0, quota_bytes: 1024, updated_at: null,
        raw_profile_content_included: true,
      });
      vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/account/session") {
          return new Response(JSON.stringify({ session: { profile: { profile_id: profileId } } }));
        }
        if (init?.method === "POST") {
          posts.push(JSON.parse(String(init.body)));
          return new Response(JSON.stringify({ ok: true }));
        }
        restoreReads++;
        if (failRestore && failure === "hung_body") {
          return { ok: true, json: () => new Promise(resolve => { finishLateBody = resolve; }) };
        }
        if (failRestore && failure === "unavailable") return new Response("Unavailable", { status: 503 });
        return new Response(JSON.stringify(snapshot(failRestore ? "user:other-profile" : profileId)));
      }));
      render(React.createElement(ProfileStorageSyncHarness));
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(posts).toEqual([]);
      expect(restoreReads).toBe(1);
      failRestore = false;
      await act(async () => { await vi.advanceTimersByTimeAsync(14_000); });
      expect(restoreReads).toBe(2);
      await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
      expect(posts).toHaveLength(1);
      expect(posts[0]).toMatchObject({ expected_profile_id: profileId });
      const readsAfterRecovery = restoreReads;
      await act(async () => {
        finishLateBody?.({ ...snapshot(), entries: [{ storage_backend: "localStorage",
          storage_key: "fixture-late-restore", value: "must-not-apply" }] });
        await vi.advanceTimersByTimeAsync(14_000);
      });
      expect(localStorage.getItem("fixture-late-restore")).toBeNull();
      expect(restoreReads).toBe(readsAfterRecovery);
      expect(posts).toHaveLength(1);
    });
  }

  it("does not apply or retry a restore body that arrives after unmount", async () => {
    vi.useFakeTimers();
    let finish: ((value: unknown) => void) | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/account/session") {
        return new Response(JSON.stringify({ session: { profile: { profile_id: profileId } } }));
      }
      return { ok: true, json: () => new Promise(resolve => { finish = resolve; }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(React.createElement(ProfileStorageSyncHarness));
    await act(async () => { await Promise.resolve(); });
    expect(finish).toBeTypeOf("function");
    view.unmount();
    const calls = fetchMock.mock.calls.length;
    await act(async () => {
      finish?.({ profile_id: profileId, artifacts: [], entries: [{
        storage_backend: "localStorage", storage_key: "fixture-unmounted", value: "must-not-apply",
      }] });
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(localStorage.getItem("fixture-unmounted")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(calls);
  });

  it("also pauses an existing backup queue when a remount cannot restore the profile", async () => {
    vi.useFakeTimers();
    useAgiChatStore.getState().newSession("Queued fixture chat");
    let restoreUnavailable = false;
    let posts = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/account/session") {
        return new Response(JSON.stringify({ session: { profile: { profile_id: profileId } } }));
      }
      if (init?.method === "POST") {
        posts++;
        return new Response(JSON.stringify({ ok: false, message: "Fixture backup unavailable" }), { status: 503 });
      }
      return restoreUnavailable ? new Response("Unavailable", { status: 503 }) : new Response(JSON.stringify({
        schema: "helix.profile_storage_snapshot.v1", profile_id: profileId, entries: [], artifacts: [],
      }));
    }));
    const first = render(React.createElement(ProfileStorageSyncHarness));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(posts).toBe(1);
    expect(getProfileStorageSyncStatus(profileId)?.pendingEntryCount).toBe(1);
    first.unmount();
    restoreUnavailable = true;
    render(React.createElement(ProfileStorageSyncHarness));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(posts).toBe(1);
    expect(getProfileStorageSyncStatus(profileId)?.lastError).toContain("Backup is paused");
  });
});

describe("profile storage sync consent", () => {
  it("does not save browser-local profile candidates until attach consent is granted", () => {
    const registry = registryWithProfileCandidate();

    expect(isProfileStorageAttachConsentGranted(profileId)).toBe(false);
    expect(shouldSaveProfileStorageSnapshot({ profileId, registry })).toBe(false);

    grantProfileStorageAttachConsent(profileId);

    expect(isProfileStorageAttachConsentGranted(profileId)).toBe(true);
    expect(shouldSaveProfileStorageSnapshot({ profileId, registry })).toBe(true);
  });

  it("uses per-profile consent and can revoke a browser attachment", () => {
    const registry = registryWithProfileCandidate();
    grantProfileStorageAttachConsent(profileId);

    expect(window.localStorage.getItem(profileStorageAttachConsentKey(profileId))).toBe("1");
    expect(shouldSaveProfileStorageSnapshot({ profileId: "user:other", registry })).toBe(false);

    revokeProfileStorageAttachConsent(profileId);

    expect(window.localStorage.getItem(profileStorageAttachConsentKey(profileId))).toBeNull();
    expect(shouldSaveProfileStorageSnapshot({ profileId, registry })).toBe(false);
  });

  it("announces consent changes so the sync hook can retry immediately", () => {
    const seen: Array<{ profileId: string; granted: boolean }> = [];
    window.addEventListener(HELIX_PROFILE_STORAGE_ATTACH_CONSENT_EVENT, ((event: CustomEvent) => {
      seen.push(event.detail);
    }) as EventListener);

    grantProfileStorageAttachConsent(profileId);
    revokeProfileStorageAttachConsent(profileId);

    expect(seen).toEqual([
      { profileId, granted: true },
      { profileId, granted: false },
    ]);
  });

  it("captures linked-source local settings as profile artifacts after consent", () => {
    window.localStorage.setItem("helix.worldEventSourceEndpoint", "https://source.example/events");
    window.localStorage.setItem("helix.worldEventSourceLabel", "Minecraft world");
    window.localStorage.setItem("helix.liveAnswer.visualCaptureRoutes.v1", JSON.stringify(["live_answer", "image_lens"]));
    grantProfileStorageAttachConsent(profileId);

    expect(shouldSaveProfileStorageSnapshot({ profileId, registry: emptyRegistry() })).toBe(true);

    const payload = buildProfileStoragePayload(emptyRegistry(), profileId);
    expect(payload.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        artifact_id: "linked-source:live-answer-world-event-endpoint",
        artifact_type: "linked_source",
        storage_key: "helix.worldEventSourceEndpoint",
      }),
      expect.objectContaining({
        artifact_id: "linked-source:live-answer-world-event-label",
        artifact_type: "linked_source",
        storage_key: "helix.worldEventSourceLabel",
      }),
      expect.objectContaining({
        artifact_id: "linked-source:live-answer-visual-capture-routes",
        artifact_type: "linked_source",
        storage_key: "helix.liveAnswer.visualCaptureRoutes.v1",
      }),
    ]));
    expect(payload.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        storage_key: "helix.worldEventSourceEndpoint",
        value: "https://source.example/events",
      }),
      expect.objectContaining({
        storage_key: "helix.worldEventSourceLabel",
        value: "Minecraft world",
      }),
    ]));
  });

  it("does not create linked-source artifacts for absent local settings", () => {
    grantProfileStorageAttachConsent(profileId);

    expect(shouldSaveProfileStorageSnapshot({ profileId, registry: emptyRegistry() })).toBe(false);
    expect(buildProfileStoragePayload(emptyRegistry(), profileId)).toMatchObject({
      artifacts: [],
      entries: [],
    });
  });

  it("captures Helix Ask chats as profile storage even before registry rehydration", () => {
    const chatState = JSON.stringify({
      state: {
        sessions: {
          "chat:test": {
            id: "chat:test",
            title: "Saved Helix Ask chat",
            createdAt: "2026-07-07T01:00:00.000Z",
            updatedAt: "2026-07-07T01:01:00.000Z",
            personaId: "default",
            contextId: "helix-ask",
            messages: [{ id: "msg:test", role: "user", content: "Saved question", at: "2026-07-07T01:00:00.000Z" }],
          },
        },
        activeId: "chat:test",
      },
      version: 0,
    });
    window.localStorage.setItem("agi-chat-sessions-v1", chatState);
    grantProfileStorageAttachConsent(profileId);

    expect(shouldSaveProfileStorageSnapshot({ profileId, registry: emptyRegistry() })).toBe(true);

    const payload = buildProfileStoragePayload(emptyRegistry(), profileId);
    expect(payload.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        artifact_id: "helix-chat-storage:agi-chat-sessions-v1",
        artifact_type: "helix_chat_session",
        storage_key: "agi-chat-sessions-v1",
      }),
    ]));
    expect(payload.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        storage_key: "agi-chat-sessions-v1",
        value: chatState,
        artifact_ids: ["helix-chat-storage:agi-chat-sessions-v1"],
      }),
    ]));
  });

  it("auto-attaches signed-in profiles so local Helix Ask chats are written", async () => {
    vi.useFakeTimers();
    const chatState = JSON.stringify({
      state: {
        sessions: {
          "chat:auto": {
            id: "chat:auto",
            title: "Auto backup chat",
            createdAt: "2026-07-07T02:00:00.000Z",
            updatedAt: "2026-07-07T02:01:00.000Z",
            personaId: "default",
            contextId: "helix-ask",
            messages: [{ id: "msg:auto", role: "user", content: "Auto saved question", at: "2026-07-07T02:00:00.000Z" }],
          },
        },
        activeId: "chat:auto",
      },
      version: 0,
    });
    window.localStorage.setItem("agi-chat-sessions-v1", chatState);
    const postedSnapshots: unknown[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/account/session") {
        return new Response(JSON.stringify({
          session: { profile: { profile_id: profileId } },
          account_policy: {},
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url === "/api/account/profile-storage/snapshot" && init?.method === "POST") {
        postedSnapshots.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ ok: true, message: "Saved." }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === "/api/account/profile-storage/snapshot") {
        return new Response(JSON.stringify({
          schema: "helix.profile_storage_snapshot.v1",
          profile_id: profileId,
          storage_backend: "profile_server",
          entries: [],
          artifacts: [],
          total_entry_bytes: 0,
          quota_bytes: 1024,
          updated_at: null,
          raw_profile_content_included: true,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({}), { status: 404, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    window.sessionStorage.setItem(`helix.profileStorage.restoreReloaded:${profileId}`, "1");

    render(React.createElement(ProfileStorageSyncHarness));
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(isProfileStorageAttachConsentGranted(profileId)).toBe(true);
    expect(postedSnapshots).toHaveLength(1);
    expect(postedSnapshots[0]).toMatchObject({
      entries: [expect.objectContaining({
        storage_key: "agi-chat-sessions-v1",
        value: chatState,
      })],
    });
  });

  it("restores profile Helix Ask chats into the live chat store before backup", async () => {
    vi.useFakeTimers();
    const chatState = JSON.stringify({
      state: {
        sessions: {
          "chat:restored": {
            id: "chat:restored",
            title: "Restored profile chat",
            createdAt: "2026-07-07T03:00:00.000Z",
            updatedAt: "2026-07-07T03:01:00.000Z",
            personaId: "default",
            contextId: "helix-ask-desktop",
            messages: [{ id: "msg:1", role: "user", content: "Restored question", at: "2026-07-07T03:00:00.000Z" }],
          },
        },
        activeId: "chat:restored",
      },
      version: 0,
    });
    const postedSnapshots: unknown[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/account/session") {
        return new Response(JSON.stringify({
          session: { profile: { profile_id: profileId } },
          account_policy: {},
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url === "/api/account/profile-storage/snapshot" && init?.method === "POST") {
        postedSnapshots.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ ok: true, message: "Saved." }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === "/api/account/profile-storage/snapshot") {
        return new Response(JSON.stringify({
          schema: "helix.profile_storage_snapshot.v1",
          profile_id: profileId,
          storage_backend: "profile_server",
          entries: [{
            storage_key: "agi-chat-sessions-v1",
            storage_backend: "localStorage",
            value: chatState,
            size_bytes: chatState.length,
            updated_at: "2026-07-07T03:01:00.000Z",
            artifact_ids: ["helix-chat-storage:agi-chat-sessions-v1"],
          }],
          artifacts: [],
          total_entry_bytes: chatState.length,
          quota_bytes: 1024 * 1024,
          updated_at: "2026-07-07T03:01:00.000Z",
          raw_profile_content_included: true,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({}), { status: 404, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(ProfileStorageSyncHarness));
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(useAgiChatStore.getState().sessions["chat:restored"]).toMatchObject({
      title: "Restored profile chat",
      messages: [expect.objectContaining({ content: "Restored question" })],
    });
    expect(useAgiChatStore.getState().activeId).toBe("chat:restored");
    // Restoration normalizes derived counters before persisting again. Verify
    // the full restored content and identity, not the legacy byte encoding.
    const normalized = JSON.parse(chatState);
    normalized.state.sessions['chat:restored'].messages[0].tokens = 5;
    normalized.state.sessions['chat:restored'].messageCount = 1;
    normalized.state.reasoningTaskBindings = {};
    expect(postedSnapshots[0]).toMatchObject({
      entries: [expect.objectContaining({
        storage_key: "agi-chat-sessions-v1",
        value: JSON.stringify(normalized),
      })],
    });
  });

  it("captures saved procedure expressions as remembered profile artifacts after consent", () => {
    const savedProcedureState = JSON.stringify({
      state: {
        currentExpression: {
          schema: "fruition.procedure_expression.v1",
          artifactId: "fruition_procedure_expression",
          expression: "direct_observation -> constrained_action",
          terms: [],
          operators: [],
        },
        history: [],
      },
      version: 0,
    });
    window.localStorage.setItem("fruition-calculator:v1", savedProcedureState);
    grantProfileStorageAttachConsent(profileId);

    expect(shouldSaveProfileStorageSnapshot({ profileId, registry: emptyRegistry() })).toBe(true);

    const payload = buildProfileStoragePayload(emptyRegistry(), profileId);
    expect(payload.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        artifact_id: "remembered-procedure:fruition-calculator",
        artifact_type: "remembered_procedure",
        storage_key: "fruition-calculator:v1",
      }),
    ]));
    expect(payload.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        storage_key: "fruition-calculator:v1",
        value: savedProcedureState,
        artifact_ids: ["remembered-procedure:fruition-calculator"],
      }),
    ]));
  });

  it("keeps a browser-local pending sync queue when profile backup fails and clears it after retry", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem("agi-chat-sessions-v1", JSON.stringify([{ id: "chat:test" }]));
    useWorkspaceMemoryRegistryStore.getState().upsertArtifact({
      artifact_id: "artifact:chat",
      artifact_type: "helix_chat_session",
      owner_scope: "browser_guest",
      storage_backend: "localStorage",
      sync_status: "profile_candidate",
      profile_id: null,
      chat_session_id: "chat:test",
      title: "Browser chat",
      storage_key: "agi-chat-sessions-v1",
      updated_at: "2026-07-06T12:00:00.000Z",
    });
    grantProfileStorageAttachConsent(profileId);

    let failBackup = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/account/session") {
        return new Response(JSON.stringify({
          session: { profile: { profile_id: profileId } },
          account_policy: {},
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url === "/api/account/profile-storage/snapshot" && init?.method === "POST") {
        if (failBackup) {
          return new Response(JSON.stringify({ ok: false, message: "Server unavailable." }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true, message: "Saved." }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === "/api/account/profile-storage/snapshot") {
        return new Response(JSON.stringify({
          schema: "helix.profile_storage_snapshot.v1",
          profile_id: profileId,
          storage_backend: "profile_server",
          entries: [],
          artifacts: [],
          total_entry_bytes: 0,
          quota_bytes: 1024,
          updated_at: null,
          raw_profile_content_included: true,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({}), { status: 404, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(ProfileStorageSyncHarness));
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(getProfileStorageSyncStatus(profileId)).toMatchObject({
      pending: true,
      pendingEntryCount: 1,
      lastError: "Server unavailable.",
    });

    failBackup = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(13_500);
    });

    expect(getProfileStorageSyncStatus(profileId)).toMatchObject({
      pending: false,
      pendingEntryCount: 0,
      lastError: null,
    });
  });
});
