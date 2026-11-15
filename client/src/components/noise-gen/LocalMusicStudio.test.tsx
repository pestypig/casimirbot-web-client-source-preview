// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LocalMusicStudio } from "./LocalMusicStudio";
import { cacheAccountCapabilityPolicy, clearCachedAccountCapabilityPolicy } from "@/lib/workstation/accountCapabilityPolicy";
import { HELIX_USER_ACCOUNT_POLICY } from "@shared/helix-account-session";
vi.mock("./StemDaw", () => ({ default: () => <div>Layer workstation</div> }));
afterEach(() => { cleanup(); clearCachedAccountCapabilityPolicy(); vi.restoreAllMocks(); delete (window as any).casimirDesktop; });
const state = { configured: true, projectId: "project:one", projectName: "Test", projects: [],
  runtimeRef: "runtime:local", modelRef: "model:base", assets: [
    { id: "asset:bass", role: "bass", label: "Bass", sha256: "a" },
    { id: "asset:drums", role: "drums", label: "Drums", sha256: "b" }],
  grant: { id: "grant:one", remaining: 10, expiresAt: new Date(Date.now()+3600000).toISOString(), bindingId: null }, jobs: [] };
function install(grant = true) {
  const api = vi.fn(async (command: any) => command.type === "asset" ?
    { ok: true, result: { mime: "audio/wav", base64: "" } } :
    { ok: true, result: { ...state, grant: grant ? state.grant : null } });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:test") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  (window as any).casimirDesktop = { localMusic: api }; return api;
}
it("sends a typed recipe preserving the selected stems and variation", async () => {
  const api = install(); render(<LocalMusicStudio onLegacy={() => {}} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Generate synth + mix" })).not.toBeDisabled());
  fireEvent.change(screen.getByLabelText("Variation"), { target: { value: "0.7" } });
  fireEvent.click(screen.getByRole("button", { name: "Generate synth + mix" }));
  await waitFor(() => expect(api).toHaveBeenCalledWith(expect.objectContaining({ type: "submit",
    request: expect.objectContaining({ operation: "generate_synth", recipe: expect.objectContaining({
      backing: { bass_asset_id: "asset:bass", drums_asset_id: "asset:drums" },
      synthesis: expect.objectContaining({ variation: .7, no_lead_melody: true }) }) }) })));
});
it("keeps generation disabled until native session approval exists", async () => {
  const api = install(false); render(<LocalMusicStudio onLegacy={() => {}} />);
  await screen.findByText("No active session. Approval happens in a native dialog.");
  expect(screen.getByRole("button", { name: "Generate synth + mix" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Allow manual controls" }));
  await waitFor(() => expect(api).toHaveBeenCalledWith({ type: "grant" }));
});
it("does not attempt web generation when the native bridge is missing", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch"); render(<LocalMusicStudio onLegacy={() => {}} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("CasimirBot desktop app");
  expect(fetcher).not.toHaveBeenCalled();
});

it("discards late project state and refreshes the successor account", async () => {
  cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile:music-a");
  const api = install();
  let finish!: (result: unknown) => void;
  api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }) as any);
  api.mockImplementation(async () => ({ ok: true, result: { ...state, assets: [], grant: null } }));
  render(<LocalMusicStudio onLegacy={() => {}} />);
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  await act(async () => {
    cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile:music-b");
    finish({ ok: true, result: { ...state, assets: [{ ...state.assets[0], label: "Private old stem" }] } });
  });
  await waitFor(() => expect(api.mock.calls.filter(([c]) => c.type === "state")).toHaveLength(2));
  expect(screen.queryByText("Private old stem")).toBeNull();
  expect(screen.getByRole("button", { name: "Generate synth + mix" })).toBeDisabled();
});

it.each(["switch", "round-trip", "unmount"])("does not refresh through an old command continuation after %s", async transition => {
  cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile:music-a");
  const api = install();
  let finish!: (result: unknown) => void;
  const original = api.getMockImplementation()!;
  api.mockImplementation(async command => command.type === "configure"
    ? new Promise(resolve => { finish = resolve; }) as any : original(command));
  const view = render(<LocalMusicStudio onLegacy={() => {}} />);
  fireEvent.change(screen.getByLabelText("Texture description"), { target: { value: "Retained same-account draft" } });
  await act(async () => { cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile:music-a"); });
  expect(screen.getByLabelText("Texture description")).toHaveValue("Retained same-account draft");
  fireEvent.click(await screen.findByRole("button", { name: "Reconnect runtime" }));
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  await act(async () => {
    if (transition === "unmount") view.unmount();
    else {
      cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile:music-b");
      if (transition === "round-trip") cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile:music-a");
    }
  });
  const readsBeforeCompletion = api.mock.calls.filter(([c]) => c.type === "state").length;
  await act(async () => { finish({ ok: true, result: {} }); });
  expect(api.mock.calls.filter(([c]) => c.type === "state")).toHaveLength(readsBeforeCompletion);
  expect(screen.queryByDisplayValue("Retained same-account draft")).toBeNull();
});

it("keeps the newer project state when an older read finishes last", async () => {
  const api = install();
  let finish!: (result: unknown) => void;
  const original = api.getMockImplementation()!;
  api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }) as any);
  api.mockImplementation(async command => command.type === "state"
    ? { ok: true, result: { ...state, projectId: "project:new", assets: [], grant: null } } : original(command));
  render(<LocalMusicStudio onLegacy={() => {}} />);
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  fireEvent.click(screen.getByRole("button", { name: "New project" }));
  await waitFor(() => expect(api.mock.calls.filter(([c]) => c.type === "state")).toHaveLength(2));
  await act(async () => { finish({ ok: true, result: { ...state,
    assets: [{ ...state.assets[0], label: "Superseded stem" }] } }); });
  expect(screen.queryByText("Superseded stem")).toBeNull();
  expect(screen.getByRole("button", { name: "Generate synth + mix" })).toBeDisabled();
});

it("uses refreshed runtime and model references in the same project's recipe", async () => {
  const api = install();
  let changed = false;
  const original = api.getMockImplementation()!;
  api.mockImplementation(async command => {
    if (command.type === "configure") changed = true;
    if (command.type === "state") return { ok: true, result: { ...state,
      runtimeRef: changed ? "runtime:replacement" : state.runtimeRef,
      modelRef: changed ? "model:replacement" : state.modelRef } };
    return original(command);
  });
  render(<LocalMusicStudio onLegacy={() => {}} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Generate synth + mix" })).not.toBeDisabled());
  fireEvent.click(screen.getByRole("button", { name: "Reconnect runtime" }));
  await waitFor(() => expect(api.mock.calls.filter(([c]) => c.type === "state")).toHaveLength(2));
  await waitFor(() => expect(screen.getByRole("button", { name: "Generate synth + mix" })).not.toBeDisabled());
  fireEvent.click(screen.getByRole("button", { name: "Generate synth + mix" }));
  await waitFor(() => expect(api).toHaveBeenCalledWith(expect.objectContaining({ type: "submit",
    request: expect.objectContaining({ recipe: expect.objectContaining({
      runtime_ref: "runtime:replacement", model_ref: "model:replacement" }) }) })));
});
