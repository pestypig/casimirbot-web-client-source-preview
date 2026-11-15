/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HelixVoiceParty, HelixVoicePartyMember } from "@shared/helix-friends-voice-party";
const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("../VoicePartyMediaBridge", () => ({
  createVoicePartyMediaBridge: mocks.create,
  INITIAL_VOICE_PARTY_MEDIA_PROJECTION: { state: "idle", peer_audio_connected: false, remote_audio_playback_ready: false },
}));
import { useVoicePartyMediaBridge } from "../useVoicePartyMediaBridge";
const party = { party_id: "voice_party:first" } as HelixVoiceParty;
const self = { participant_id: "participant:first" } as HelixVoicePartyMember;
const api = {} as never;
let bridges: Array<{ close: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; syncParty: ReturnType<typeof vi.fn> }>;
beforeEach(() => {
  vi.clearAllMocks(); bridges = [];
  mocks.create.mockImplementation(() => {
    const bridge = { close: vi.fn(async () => {}), start: vi.fn(async () => {}), syncParty: vi.fn() };
    bridges.push(bridge); return bridge;
  });
});
afterEach(cleanup);
it.each(["stop", "unmount", "identity"])("cancels a pending restart on %s", async boundary => {
  const hook = renderHook(({ selected }) => useVoicePartyMediaBridge({ party: selected, self, api }), { initialProps: { selected: party } });
  await act(async () => { await hook.result.current.start(); });
  let release!: () => void;
  const closing = new Promise<void>(resolve => { release = resolve; });
  bridges[0].close.mockImplementation(() => closing);
  let restarting!: Promise<void>;
  let stopping: Promise<void> | undefined;
  act(() => { restarting = hook.result.current.start(); });
  if (boundary === "stop") act(() => { stopping = hook.result.current.stop(); });
  else if (boundary === "unmount") hook.unmount();
  else hook.rerender({ selected: { ...party, party_id: "voice_party:other" } });
  await act(async () => { release(); await restarting; await stopping; });
  expect(mocks.create).toHaveBeenCalledTimes(1);
});
it("closes the previous party when the selected identity disappears", async () => {
  const hook = renderHook(({ selected }) => useVoicePartyMediaBridge({ party: selected, self, api }), { initialProps: { selected: party as HelixVoiceParty | null } });
  await act(async () => { await hook.result.current.start(); });
  hook.rerender({ selected: null });
  expect(bridges[0].close).toHaveBeenCalledOnce();
});
