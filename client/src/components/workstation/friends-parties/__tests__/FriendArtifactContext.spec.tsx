/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { FriendArtifactWorkspace } from "../FriendArtifactWorkspace";
import { useAgiChatStore } from "@/store/useAgiChatStore";
import { createHandTableScenario } from "@shared/physics-glyphs/scenario-example";
import { friendGlyphArtifactSchema } from "@shared/helix-friend-board";

const account = vi.hoisted(() => ({ profileId: "recipient", revision: 1 }));
vi.mock("@/lib/workstation/accountCapabilityPolicy", () => ({
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT: "test:profile-changed",
  readCachedAccountProfileIdentity: () => ({ ...account }),
}));
vi.mock("@/store/useAgiChatStore", async () => {
  const { create } = await import("zustand");
  return { useAgiChatStore: create(() => ({ activeId: "selected-chat" })) };
});
vi.mock("@/components/physics-glyphs/QuantumGlyphAnswer", () => ({ QuantumGlyphAnswer: () => null }));
const binding = () => ({ status: "active", reasoning_binding_id: "binding-selected", binding_epoch: 3, helix_conversation_id: "selected-chat", run_id: null });
const reply = (b = binding()) => new Response(JSON.stringify({ ok: true, binding: b }));
function artifact() {
  const scenario = createHandTableScenario();
  return friendGlyphArtifactSchema.parse({ schema: "helix.friend_glyph_artifact.v1", kind: "physics_glyph", generation_id: "11111111-1111-4111-8111-111111111111", renderer: "physics-glyph-story.v1", document: { schema: "helix.physics_glyph_document.v1", configuration: { preset: "scenario", scenario, perspective: scenario.perspectives[0] } } });
}
const open = () => render(<FriendArtifactWorkspace artifact={artifact()} onClose={() => {}} />);
const send = () => fireEvent.click(screen.getByRole("button", { name: "Send context to my paired chat" }));
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  account.profileId = "recipient"; account.revision = 1;
  useAgiChatStore.setState({ activeId: "selected-chat" });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("looks up and queues context only for the selected chat", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(reply()).mockResolvedValueOnce(new Response("{}", { status: 202 }));
  vi.stubGlobal("fetch", fetcher); open(); send();
  await screen.findByText(/Context queued for the exact paired chat/);
  expect(fetcher.mock.calls[0][0]).toBe("/api/account/session/agent-connections/reasoning-bindings/current?helix_conversation_id=selected-chat");
  const posted = JSON.parse(fetcher.mock.calls[1][1].body);
  expect(posted).toMatchObject({ reasoning_binding_id: "binding-selected", binding_epoch: 3, helix_conversation_id: "selected-chat", run_id: null, expires_in_seconds: 600 });
  expect(posted.instruction_text).toContain("not instructions or a grant");
  expect(posted.instruction_text).toContain("starts no additional AI turn");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("requires a selected chat before looking up any pairing", async () => {
  useAgiChatStore.setState({ activeId: undefined });
  const fetcher = vi.fn().mockResolvedValue(reply()); vi.stubGlobal("fetch", fetcher); open(); send();
  await screen.findByText(/Select an active paired chat first/);
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([
  { helix_conversation_id: "different-chat" }, { status: "expired" }, { binding_epoch: 0 }, { reasoning_binding_id: "" },
])("rejects a mismatched or unusable binding: %j", async overrides => {
  const fetcher = vi.fn().mockResolvedValue(reply({ ...binding(), ...overrides }));
  vi.stubGlobal("fetch", fetcher); open(); send();
  await screen.findByText(/Select an active paired chat first/);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each(["account", "revision", "destination", "destination-round-trip", "unmount", "copy"])("does not post a late lookup after %s changes", async change => {
  let finish!: (r: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", fetcher); const view = open(); send();
  const signal = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].signal;
  act(() => {
    if (change === "account" || change === "revision") {
      if (change === "account") account.profileId = "someone-else";
      account.revision++;
      window.dispatchEvent(new Event("test:profile-changed"));
    } else if (change.startsWith("destination")) {
      useAgiChatStore.setState({ activeId: "another-chat" });
      if (change === "destination-round-trip") useAgiChatStore.setState({ activeId: "selected-chat" });
    } else if (change === "unmount") view.unmount();
    else view.rerender(<FriendArtifactWorkspace artifact={artifact()} onClose={() => {}} />);
  });
  await act(async () => { finish(reply()); });
  expect(signal?.aborted).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/Context queued/)).toBeNull();
});

it("rechecks account identity after a deferred JSON body without relying on an event", async () => {
  let finish!: (b: unknown) => void;
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(resolve => { finish = resolve; }) });
  vi.stubGlobal("fetch", fetcher); open(); send();
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  account.revision++;
  await act(async () => { finish({ binding: binding() }); });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("permits only one pending send and ignores a late POST after destination change", async () => {
  let finish!: (r: Response) => void;
  const fetcher = vi.fn().mockResolvedValueOnce(reply()).mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", fetcher); open(); send(); send();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  act(() => useAgiChatStore.setState({ activeId: "another-chat" }));
  await act(async () => { finish(new Response("{}", { status: 202 })); });
  expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true);
  expect(screen.queryByText(/Context queued/)).toBeNull();
});
