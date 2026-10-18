// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import DurableTaskPairing from "../DurableTaskPairing";
import { buildProfileStoragePayload } from "../../../lib/workstation/profileStorageSync";
import { useWorkspaceMemoryRegistryStore } from "../../../store/useWorkspaceMemoryRegistryStore";

const profileId = "profile:origin-owner", chatId = "chat:origin-exact";
const key = `helix.pairing.review.v1:${JSON.stringify([profileId, chatId])}`;
const destination = { registrationId: "registration:origin-exact", expiresAt: "2099-01-01T00:00:00.000Z",
  destinationDigest: "b".repeat(64), proofBasis: "authenticated_client_declaration",
  currentPresence: false, pairingAuthority: false, executionAuthority: false,
  destination: { issuer: "issuer:fixture", profileId, installationId: "installation:fixture",
    clientId: "client:fixture", taskId: "task:fixture" } };
afterEach(() => { cleanup(); localStorage.clear();
  useWorkspaceMemoryRegistryStore.setState({ artifacts: {} }); vi.unstubAllGlobals(); });

it("O4 includes the exact unknown-outcome request in owner profile backup, without replaying approval", async () => {
  const posts: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (init.method === "POST") { posts.push(JSON.parse(init.body as string)); throw new Error("fixture lost reply"); }
    return new Response(JSON.stringify(url.includes("reasoning-invitations/")
      ? { ok: true, pairing: null, execution_authority: false, answer_authority: false }
      : { ok: true, destinations: [destination], execution_authority: false, answer_authority: false }));
  }));
  render(<DurableTaskPairing profileId={profileId} chatId={chatId} />);
  await screen.findByRole("option", { name: "task:fixture · client:fixture" });
  fireEvent.change(screen.getByLabelText("Registered AI task"), { target: { value: destination.registrationId } });
  fireEvent.click(screen.getByLabelText(/I approve pairing/));
  fireEvent.click(screen.getByRole("button", { name: "Approve pairing and create invitation" }));
  await screen.findByRole("alert");
  await waitFor(() => {
    const payload = buildProfileStoragePayload(useWorkspaceMemoryRegistryStore.getState().buildRegistrySnapshot(), profileId);
    expect(payload.entries.find(entry => entry.storage_key === key)?.value).toBe(JSON.stringify(posts[0]));
    expect(payload.entries.find(entry => entry.storage_key === `${key}:destination`)?.value).toBe(destination.destinationDigest);
    expect(JSON.stringify(payload)).not.toMatch(/"secret"|"approved"|"runtime_binding"/);
  });
  expect(posts).toHaveLength(1);
});
