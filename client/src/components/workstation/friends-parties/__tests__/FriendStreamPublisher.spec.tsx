/** @vitest-environment jsdom */
import { renderHook, act, cleanup } from "@testing-library/react";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { latestAssistantUpdate, startFriendPublishing, stopFriendPublishing, revokeFriendSource, shareSelectedText, useFriendStreamPublisher, publisherState } from "../useFriendStreamPublisher";
const f = vi.hoisted(() => ({ profile: { profileId: "alice", revision: 1 }, start: vi.fn(), retire: vi.fn(), request: vi.fn() }));
vi.mock("@/lib/workstation/accountCapabilityPolicy", () => ({ HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT: "profile-changed", readCachedAccountProfileIdentity: () => f.profile }));
vi.mock("../FriendStreamsApi", () => ({ friendStreamsApi: { start: f.start, retire: f.retire }, streamRequest: f.request }));
const source = { kind: "codex" as const, ref: "codex-thread:11111111-1111-4111-8111-111111111111", title: "Selected" };
let turns = [{ id: "turn-1", user: "private prompt", assistant: "old answer", assistantPhase: "final_answer" as const, status: "completed" as const }];
beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.stubGlobal("crypto", webcrypto);
    f.profile = { profileId: "alice", revision: 1 };
    turns = [{ id: "turn-1", user: "private prompt", assistant: "old answer", assistantPhase: "final_answer", status: "completed" }];
    f.start.mockResolvedValue({ preview: { revision: "11111111-1111-4111-8111-111111111111", source } });
    f.request.mockResolvedValue({});
    f.retire.mockResolvedValue({});
    window.casimirDesktop = { setFriendPublisherActive: vi.fn(async () => ({})), codexStreamGrants: vi.fn(async (input: unknown) => (input as {
            operation: string;
        }).operation === "list" ? { status: "ready", deviceRef: "node-a", grants: [{ sourceRef: source.ref, title: source.title }] } : { status: "ready", frame: { turns } }) } as never;
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); delete window.casimirDesktop; });
describe("owner-started friend publishing", () => {
    it("requests native background timing only for an explicit share and clears it on stop/unmount", async () => {
        const hook = renderHook(() => useFriendStreamPublisher());
        const timing = window.casimirDesktop!.setFriendPublisherActive!;
        expect(timing).not.toHaveBeenCalled();
        await startFriendPublishing(source, { kind: "friends" }, "");
        expect(timing).toHaveBeenLastCalledWith(true);
        await act(async () => vi.advanceTimersByTimeAsync(15000));
        expect(timing).toHaveBeenCalledTimes(2);
        await stopFriendPublishing();
        expect(timing).toHaveBeenLastCalledWith(false);
        await act(async () => vi.advanceTimersByTimeAsync(60000));
        expect(timing).toHaveBeenCalledTimes(3);
        await startFriendPublishing(source, { kind: "friends" }, "");
        hook.unmount();
        expect(timing).toHaveBeenLastCalledWith(false);
    });
    it("releases native timing after a publishing error without silently restarting", async () => {
        renderHook(() => useFriendStreamPublisher());
        await startFriendPublishing(source, { kind: "friends" }, "");
        f.request.mockRejectedValueOnce(new Error("Publishing session expired"));
        await act(async () => vi.advanceTimersByTimeAsync(15000));
        expect(window.casimirDesktop!.setFriendPublisherActive).toHaveBeenLastCalledWith(false);
        expect(publisherState().failure).toContain("expired");
        expect(f.start).toHaveBeenCalledTimes(1);
    });
    it("preserves a valid share when selected text is rejected by content policy", async () => {
        renderHook(() => useFriendStreamPublisher());
        await startFriendPublishing(source, { kind: "friends" }, "");
        f.request.mockRejectedValueOnce(new Error("Remove imported context before sharing"));
        await expect(shareSelectedText("[[CasimirBot shared context: incoming")).rejects.toThrow("Remove imported context");
        expect(f.retire).not.toHaveBeenCalled();
        expect(publisherState().active?.source).toEqual(source);
    });
    it("does not publish selected text after Stop while its grant recheck is pending", async () => {
        renderHook(() => useFriendStreamPublisher());
        await startFriendPublishing(source, { kind: "friends" }, "");
        let finish!: (value: unknown) => void;
        vi.mocked(window.casimirDesktop!.codexStreamGrants!).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
        const sending = shareSelectedText("Selected update");
        await stopFriendPublishing();
        finish({ status: "ready", frame: { turns } });
        await expect(sending).rejects.toThrow("shared chat changed");
        expect(f.request).not.toHaveBeenCalled();
        expect(f.retire).toHaveBeenCalledTimes(1);
    });
    it("revokes the native grant even if remote retirement cannot be confirmed", async () => {
        renderHook(() => useFriendStreamPublisher());
        await startFriendPublishing(source, { kind: "friends" }, "");
        f.retire.mockRejectedValueOnce(new Error("offline"));
        vi.mocked(window.casimirDesktop!.codexStreamGrants!).mockResolvedValue({ status: "ready", revoked: true });
        await expect(revokeFriendSource(source)).rejects.toThrow("local read grant was revoked");
        expect(window.casimirDesktop!.codexStreamGrants).toHaveBeenLastCalledWith({ operation: "revoke", sourceRef: source.ref });
        expect(publisherState().active).toBeNull();
        expect(publisherState().failure).toContain("could not confirm removal");
    });
    it("leaves another selected publisher running when a different read grant is revoked", async () => {
        renderHook(() => useFriendStreamPublisher());
        await startFriendPublishing(source, { kind: "friends" }, "");
        vi.mocked(window.casimirDesktop!.codexStreamGrants!).mockResolvedValue({ status: "ready", revoked: true });
        await revokeFriendSource({ ...source, ref: "codex-thread:22222222-2222-4222-8222-222222222222" });
        expect(f.retire).not.toHaveBeenCalled();
        expect(publisherState().active?.source).toEqual(source);
    });
    it("retires the exact publishing session when its native source grant is lost", async () => {
        renderHook(() => useFriendStreamPublisher());
        await startFriendPublishing(source, { kind: "friends" }, "");
        vi.mocked(window.casimirDesktop!.codexStreamGrants!).mockResolvedValue({ status: "unavailable" });
        await act(async () => vi.advanceTimersByTimeAsync(15000));
        expect(publisherState().active).toBeNull();
        expect(f.retire).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", "node-a");
        expect(f.request).not.toHaveBeenCalled();
    });
    it("rechecks the source grant before selected-text delivery between polling ticks", async () => {
        renderHook(() => useFriendStreamPublisher());
        await startFriendPublishing(source, { kind: "friends" }, "");
        vi.mocked(window.casimirDesktop!.codexStreamGrants!).mockResolvedValue({ status: "unavailable" });
        await expect(shareSelectedText("A harmless selected update")).rejects.toThrow("exact-chat read");
        expect(f.request).not.toHaveBeenCalled();
        expect(f.retire).toHaveBeenCalledTimes(1);
    });
    it("baselines existing output and publishes only a later visible assistant update", async () => {
        renderHook(() => useFriendStreamPublisher());
        await startFriendPublishing(source, { kind: "friends" }, "Working");
        await act(async () => vi.advanceTimersByTimeAsync(15000));
        expect(f.request).toHaveBeenCalledWith("/heartbeat", expect.anything());
        expect(f.request.mock.calls.some(([path]) => path === "/publish")).toBe(false);
        turns = [{ ...turns[0], assistant: "new visible answer" }];
        await act(async () => vi.advanceTimersByTimeAsync(15000));
        await vi.waitFor(() => expect(f.request).toHaveBeenCalledWith("/publish", expect.objectContaining({ text: "new visible answer", content_kind: "assistant", imported: false })));
        expect(JSON.stringify(f.request.mock.calls)).not.toContain("private prompt");
    });
    it("stops polling and clears publication on an account switch", async () => {
        renderHook(() => useFriendStreamPublisher());
        await startFriendPublishing(source, { kind: "friends" }, "");
        f.profile = { profileId: "bob", revision: 2 };
        act(() => window.dispatchEvent(new Event("profile-changed")));
        await act(async () => vi.advanceTimersByTimeAsync(30000));
        expect(publisherState().active).toBeNull();
        expect(f.request).not.toHaveBeenCalled();
        expect(window.casimirDesktop!.setFriendPublisherActive).toHaveBeenLastCalledWith(false);
    });
    it("does not project user messages or imported context into automatic publishing", () => {
        expect(latestAssistantUpdate([{ ...turns[0], assistant: null }])).toBeNull();
        expect(latestAssistantUpdate([{ ...turns[0], assistant: "[[CasimirBot shared context: incoming" }])).toBeNull();
    });
});
