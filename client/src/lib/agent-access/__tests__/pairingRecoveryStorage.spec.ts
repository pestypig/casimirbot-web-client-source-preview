// @vitest-environment jsdom
import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { pairingRecoveryValueAllowed, pairingReviewStorageKey } from "../pairingRecoveryStorage";
import { buildProfileStoragePayload, useProfileStorageSync } from "../../workstation/profileStorageSync";
import { useWorkspaceMemoryRegistryStore } from "../../../store/useWorkspaceMemoryRegistryStore";

const owner = "profile:recovery-owner", chat = "chat:recovery-exact";
const key = pairingReviewStorageKey(owner, chat);
const review = { requestId: "request:exact", registrationId: "registration:exact", chatId: chat,
  environment: { roomId: "room:exact", runId: "run:exact" }, invitationSeconds: 900, pairingSeconds: 28800 };
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear();
  useWorkspaceMemoryRegistryStore.setState({ artifacts: {} }); vi.unstubAllGlobals(); });

it.each(["", ":draft"])("allows the strict exact-chat request at %s", suffix => {
  expect(pairingRecoveryValueAllowed(owner, key + suffix, JSON.stringify(review))).toBe(true);
});
it.each([
  ["foreign profile", pairingReviewStorageKey("profile:other", chat), review],
  ["foreign chat", key, { ...review, chatId: "chat:other" }],
  ["secret", key, { ...review, secret: "fixture-only-secret" }],
  ["approval", key, { ...review, approved: true }],
  ["runtime binding", key, { ...review, reasoning_binding_id: "binding:fixture" }],
  ["unbounded duration", key, { ...review, pairingSeconds: 999999 }],
  ["unknown companion", key + ":credential", review],
  ["noncanonical owner key", 'helix.pairing.review.v1:["profile:recovery-owner", "chat:recovery-exact"]', review],
])("excludes %s even when a registry artifact falsely labels it as owned", (_label, storageKey, value) => {
  const serialized = JSON.stringify(value);
  expect(pairingRecoveryValueAllowed(owner, storageKey as string, serialized)).toBe(false);
  localStorage.setItem(storageKey as string, serialized);
  const registry = useWorkspaceMemoryRegistryStore.getState();
  registry.upsertArtifact({ artifact_id: "fixture:recovery", artifact_type: "workstation_session_draft",
    storage_key: storageKey as string, storage_backend: "localStorage", owner_scope: "profile",
    profile_id: owner, sync_status: "profile_candidate" });
  expect(buildProfileStoragePayload(registry.buildRegistrySnapshot(), owner).entries).toEqual([]);
});
it("rejects malformed, oversized and secret-bearing identifier records", () => {
  for (const value of ["not-json", "x".repeat(12001)]) expect(pairingRecoveryValueAllowed(owner, key, value)).toBe(false);
  expect(pairingRecoveryValueAllowed(owner, key + ":destination", "a".repeat(64))).toBe(true);
  expect(pairingRecoveryValueAllowed(owner, key + ":destination", JSON.stringify({ secret: "fixture" }))).toBe(false);
  expect(pairingRecoveryValueAllowed(owner, key + ":pairing", "pairing:00000000-0000-4000-8000-000000000001")).toBe(true);
  expect(pairingRecoveryValueAllowed(owner, key + ":pairing", JSON.stringify({ id: "pairing:fixture", secret: "fixture" }))).toBe(false);
  expect(pairingRecoveryValueAllowed(owner, key + ":previous", JSON.stringify({ review, secret: "fixture" }))).toBe(false);
});

it("preserves a previous-pairing review only with strict matching chat and non-authority flags", () => {
  const pairing = { schema: "helix.pairing_status.v1", id: "pairing:fixture", revision: 2,
    destinationDigest: "c".repeat(64), chatId: chat, environment: review.environment, state: "accepted",
    createdAt: "2026-09-14T00:00:00.000Z", invitationExpiresAt: "2026-09-14T00:15:00.000Z",
    pairingExpiresAt: "2026-09-14T08:00:00.000Z", acceptedAt: "2026-09-14T00:01:00.000Z", revokedAt: null,
    executionAuthority: false, answerAuthority: false };
  expect(pairingRecoveryValueAllowed(owner, key + ":previous", JSON.stringify({ review, pairing }))).toBe(true);
  for (const patch of [{ chatId: "chat:other" }, { executionAuthority: true }, { answerAuthority: true }, { secret: "fixture" }])
    expect(pairingRecoveryValueAllowed(owner, key + ":previous", JSON.stringify({ review, pairing: { ...pairing, ...patch } }))).toBe(false);
});

it("the restore hook discards foreign and secret-bearing keys from an otherwise owner-matched snapshot", async () => {
  const entries = [
    { storage_key: key + ":draft", value: JSON.stringify(review) },
    { storage_key: key, value: JSON.stringify({ ...review, approved: true, secret: "fixture-secret" }) },
    { storage_key: pairingReviewStorageKey("profile:foreign", chat), value: JSON.stringify(review) },
  ].map(entry => ({ ...entry, storage_backend: "localStorage", size_bytes: entry.value.length,
    updated_at: "2026-09-14T00:00:00.000Z", artifact_ids: [entry.storage_key] }));
  const artifacts = entries.map(entry => ({ schema: "helix.workspace_memory_registry.v1",
    artifact_id: entry.storage_key, artifact_type: "workstation_session_draft", owner_scope: "profile",
    profile_id: owner, chat_session_id: chat, storage_backend: "localStorage", storage_key: entry.storage_key,
    sync_status: "profile_synced", title: "Fixture", updated_at: entry.updated_at }));
  const posts: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") { posts.push(url); return new Response(JSON.stringify({ ok: true })); }
    return new Response(JSON.stringify(url === "/api/account/session"
      ? { session: { profile: { profile_id: owner } } }
      : { schema: "helix.profile_storage_snapshot.v1", profile_id: owner, entries, artifacts }));
  }));
  sessionStorage.setItem(`helix.profileStorage.restoreReloaded:${owner}`, "1");
  function Fixture() { useProfileStorageSync(); return null; }
  render(React.createElement(Fixture));
  await waitFor(() => expect(localStorage.getItem(key + ":draft")).toBe(JSON.stringify(review)));
  expect(localStorage.getItem(key)).toBeNull();
  expect(localStorage.getItem(entries[2].storage_key)).toBeNull();
  expect(useWorkspaceMemoryRegistryStore.getState().listArtifacts().map(artifact => artifact.storage_key)).toEqual([key + ":draft"]);
  expect(posts.some(url => url.includes("reasoning-"))).toBe(false);
});
