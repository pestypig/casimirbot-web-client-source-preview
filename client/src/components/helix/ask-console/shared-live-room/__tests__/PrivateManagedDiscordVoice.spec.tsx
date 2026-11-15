// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrivateManagedDiscordVoice } from "../PrivateManagedDiscordVoice";
import { cacheAccountCapabilityPolicy, clearCachedAccountCapabilityPolicy } from "@/lib/workstation/accountCapabilityPolicy";
import { HELIX_USER_ACCOUNT_POLICY } from "@shared/helix-account-session";

const roomId = "shared_realtime_room:00000000-0000-4000-8000-000000000001";
const requestId = "00000000-0000-4000-8000-000000000003";
const revision = "a".repeat(64);
const binding = { schema: "helix.discord_voice_managed_binding.v1",
  api_version: "v1", ok: true,
  operation: "room.discord_voice.managed_binding", room: { room_id: roomId },
  reentry_required: true, answer_authority: false, assistant_answer: false,
  terminal_eligible: false, audio_connected: false, model_input: false,
  raw_content_included: false,
  invitation_id: "discord_voice:00000000-0000-4000-8000-000000000002",
  contract_request_id: requestId, contract_review_revision: revision,
  contract_task_ref: "task:exact-123", contract_device_ref: "device:exact-123",
  lease_until: new Date(Date.now() + 120_000).toISOString() };
const response = (body: unknown) => new Response(JSON.stringify(body),
  { status: 200, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  cleanup();
  clearCachedAccountCapabilityPolicy();
  vi.unstubAllGlobals();
  delete window.casimirDesktop;
});

describe("private managed Discord voice control", () => {
  it.each(["binding", "approval"].flatMap(checkpoint => ["room", "account", "unmount"].map(transition => ({ checkpoint, transition }))))(
    "does not start from a late $checkpoint after $transition change", async ({ checkpoint, transition }) => {
      cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile:voice-a");
      const start = vi.fn(async () => ({ ok: true, answer: { state: "settled" } }));
      Object.defineProperty(window, "casimirDesktop", { configurable: true, value: { cappedMembershipVoiceStart: start } });
      const approval = { ok: true, requests: [{ request_id: requestId, review_revision: revision,
        task_ref: binding.contract_task_ref, installation_ref: binding.contract_device_ref, status: "approved",
        approval: { reviewedRevision: revision, expiresAtMs: Date.now() + 120_000 },
        scopes: [{ branch: "discord_voice", mode: "gpt_live", room_ref: roomId, duration_seconds: 600 }] }] };
      let finish!: () => void;
      const fetcher = vi.fn(async (url: string) => url.includes("/live/probe/status")
        ? response({ schema: "casimirbot.capped_live_probe_status.v1", private_media_ready: true })
        : checkpoint === "approval" ? new Promise<Response>(resolve => { finish = () => resolve(response(approval)); })
        : response(approval));
      vi.stubGlobal("fetch", fetcher);
      const readBinding = vi.fn(async () => checkpoint === "binding"
        ? new Promise(resolve => { finish = () => resolve(binding); }) : binding);
      const view = render(<PrivateManagedDiscordVoice roomId={roomId} readBinding={readBinding} />);
      fireEvent.click(await screen.findByRole("button", { name: "Start one contract-approved managed call" }));
      await waitFor(() => expect(finish).toBeTypeOf("function"));
      await act(async () => {
        if (transition === "unmount") view.unmount();
        else if (transition === "account") cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile:voice-b");
        else view.rerender(<PrivateManagedDiscordVoice roomId="shared_realtime_room:00000000-0000-4000-8000-000000000099" readBinding={readBinding} />);
      });
      await act(async () => { finish(); });
      expect(start).not.toHaveBeenCalled();
      expect(fetcher.mock.calls.filter(([url]) => url.includes("setup-contract")))
        .toHaveLength(checkpoint === "approval" ? 1 : 0);
    });
  it("does not call the native provider path when the exact contract is absent", async () => {
    const start = vi.fn(async () => ({ ok: true, answer: { state: "settled" } }));
    Object.defineProperty(window, "casimirDesktop", {
      configurable: true, value: { cappedMembershipVoiceStart: start },
    });
    const fetch = vi.fn(async (url: string) => response(url.includes("/live/probe/status")
      ? { schema: "casimirbot.capped_live_probe_status.v1",
        private_media_ready: true } : { ok: true, requests: [] }));
    vi.stubGlobal("fetch", fetch);
    const readBinding = vi.fn(async () => binding);
    render(<PrivateManagedDiscordVoice roomId={roomId}
      readBinding={readBinding} />);
    fireEvent.click(await screen.findByRole("button",
      { name: "Start one contract-approved managed call" }));
    await waitFor(() => expect(screen.getByRole("status").textContent)
      .toContain("retry this check"));
    expect(readBinding).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
    expect(screen.getByRole("button",
      { name: "Start one contract-approved managed call" }).hasAttribute("disabled"))
      .toBe(false);
  });
  it("passes only the exact approved binding to the native start", async () => {
    const start = vi.fn(async () => ({ ok: true, answer: {
      state: "settled" } }));
    Object.defineProperty(window, "casimirDesktop", {
      configurable: true, value: { cappedMembershipVoiceStart: start },
    });
    const fetch = vi.fn(async (url: string) => response(url.includes("/live/probe/status")
      ? { schema: "casimirbot.capped_live_probe_status.v1",
        private_media_ready: true } : { ok: true, requests: [{
          request_id: requestId, review_revision: revision,
          task_ref: binding.contract_task_ref,
          installation_ref: binding.contract_device_ref,
          status: "approved", approval: { reviewedRevision: revision,
            expiresAtMs: Date.now() + 120_000 },
          scopes: [{ branch: "discord_voice", mode: "gpt_live",
            room_ref: roomId, duration_seconds: 600 }],
        }] }));
    vi.stubGlobal("fetch", fetch);
    render(<PrivateManagedDiscordVoice roomId={roomId}
      readBinding={async () => binding} />);
    fireEvent.click(await screen.findByRole("button",
      { name: "Start one contract-approved managed call" }));
    await waitFor(() => expect(start).toHaveBeenCalledOnce());
    expect(start).toHaveBeenCalledWith(expect.objectContaining({
      contract_request_id: requestId,
      contract_review_revision: revision,
      contract_task_ref: binding.contract_task_ref,
      media_binding_id: `${roomId}:00000000-0000-4000-8000-000000000002`,
    }));
  });
});
