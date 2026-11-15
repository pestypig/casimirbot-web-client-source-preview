/** @vitest-environment jsdom */
import React from "react";
import { act, render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { FriendStreamsPanel } from "../FriendStreamsPanel";
const f = vi.hoisted(() => ({ list: vi.fn(), sources: vi.fn(), follow: vi.fn(), start: vi.fn(), stop: vi.fn(), revoke: vi.fn(), unfollow: vi.fn(), nativeSources: [] as Array<{ kind: "codex"; ref: string; title: string }>, nativeInstallation: "node" as string | null, profile: "bob", revision: 0 }));
vi.mock("@/lib/workstation/accountCapabilityPolicy", () => ({
    readCachedAccountProfileIdentity: () => ({ profileId: f.profile, revision: f.revision }),
}));
vi.mock("../FriendStreamsApi", () => ({ friendStreamsApi: f }));
vi.mock("../FriendsConnectionRecovery", () => ({
    FriendsConnectionRecovery: ({ onConnected }: { onConnected: () => void }) =>
        <button onClick={onConnected}>Complete test Friends recovery</button>,
}));
vi.mock("../useFriendStreamPublisher", () => ({ nativeStreamSources: async () => ({ installation: f.nativeInstallation, sources: f.nativeSources }), streamInstallation: async () => "node", revokeFriendSource: f.revoke,
    publisherState: () => ({ active: null, failure: null }), subscribePublisher: () => () => { }, startFriendPublishing: f.start, stopFriendPublishing: f.stop, shareSelectedText: vi.fn() }));
const friend = { state: "accepted", friendship_id: "ab", peer: { profile_id: "alice", handle: "alex", display_name: "Alex" } } as never;
const preview = { publisher_id: "alice", revision: "revision", source: { kind: "agent_api", ref: "source-run", title: "Server setup" }, activity: "Working on the bridge", text: "Connection test passed.", event_key: "event" };
beforeEach(() => { vi.clearAllMocks(); f.profile = "bob"; f.revision++; f.nativeInstallation = "node"; f.nativeSources = []; f.list.mockResolvedValue({ previews: [preview], subscriptions: [] }); f.sources.mockResolvedValue({ sources: [{ kind: "agent_api", ref: "source-run", title: "My source" }] }); f.start.mockResolvedValue(undefined); f.follow.mockResolvedValue({}); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("friend status and shared chat controls", () => {
    it("offers direct recovery after publishing loses Friends access without retrying publication", async () => {
        f.start.mockRejectedValueOnce(Object.assign(new Error("Friends connection required"), { code: "friends_parties_connection_required" }));
        render(<FriendStreamsPanel friends={[friend]} presence={[]}/>);
        await screen.findByText("Agent API · My source");
        fireEvent.change(screen.getByLabelText("Chat to share"), { target: { value: "agent_api:source-run" } });
        fireEvent.click(screen.getByText("Start sharing"));
        fireEvent.click(await screen.findByText("Complete test Friends recovery"));
        await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
        expect(f.start).toHaveBeenCalledOnce();
        expect(f.follow).not.toHaveBeenCalled();
        expect((screen.getByLabelText("Chat to share") as HTMLSelectElement).value).toBe("agent_api:source-run");
    });
    it("removes stale stream cards and offers recovery when a later poll loses access", async () => {
        vi.useFakeTimers();
        render(<FriendStreamsPanel friends={[friend]} presence={[]}/>);
        await act(async () => {});
        expect(screen.getByText("Connection test passed.")).toBeTruthy();
        f.list.mockRejectedValueOnce(Object.assign(new Error("Friends connection required"), { code: "friends_parties_connection_required" }));
        await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
        expect(screen.queryByText("Connection test passed.")).toBeNull();
        expect(screen.getByText("Complete test Friends recovery")).toBeTruthy();
        fireEvent.click(screen.getByText("Retry loading shared chats"));
        await act(async () => {});
        expect(screen.getByText("Connection test passed.")).toBeTruthy();
        expect(screen.queryByRole("alert")).toBeNull();
        expect(f.follow).not.toHaveBeenCalled();
        expect(f.start).not.toHaveBeenCalled();
    });
    it("identifies duplicate source titles by exact chat and revokes only the selected read grant", async () => {
        const source = { kind: "codex" as const, ref: "codex-thread:11111111-1111-4111-8111-111111111111", title: "Selected Codex chat" };
        const other = { ...source, ref: "codex-thread:22222222-2222-4222-8222-222222222222" };
        f.nativeSources = [source, other];
        f.revoke.mockImplementation(async () => { f.nativeSources = [other]; });
        render(<FriendStreamsPanel friends={[friend]} presence={[]}/>);
        await screen.findByText("Agent API · My source");
        fireEvent.change(screen.getByLabelText("Chat to share"), { target: { value: `codex:${source.ref}` } });
        expect(screen.getByLabelText("Selected source chat").textContent).toContain("codex://threads/11111111-1111-4111-8111-111111111111");
        fireEvent.click(screen.getByText("Revoke selected chat read access"));
        await waitFor(() => expect(f.revoke).toHaveBeenCalledWith(source));
        await waitFor(() => expect(screen.queryByLabelText("Selected source chat")).toBeNull());
        expect(screen.getByRole("option", { name: "Codex · Selected Codex chat" })).toBeTruthy();
        expect(f.start).not.toHaveBeenCalled();
        expect(f.follow).not.toHaveBeenCalled();
    });
    it("shows a room-authorized stream without claiming the participant is a saved friend", async () => {
        f.list.mockResolvedValue({ own_profile_id: "bob", previews: [{ ...preview, publisher_name: "Alex" }], subscriptions: [] });
        render(<FriendStreamsPanel friends={[]} presence={[]}/>);
        expect(await screen.findByText("Alex · Room participant")).toBeTruthy();
        expect(screen.getByText("Status: Shared in your room")).toBeTruthy();
        expect(f.follow).not.toHaveBeenCalled();
    });
    it("shows the accepted friend's status card and current preview without following automatically", async () => {
        render(<FriendStreamsPanel friends={[friend]} presence={[{ profile_id: "alice", state: "online" } as never]}/>);
        expect(await screen.findByText("Connection test passed.")).toBeTruthy();
        expect(screen.getByLabelText("Status card for alex").textContent).toContain("Status: online");
        expect(f.follow).not.toHaveBeenCalled();
        expect(f.start).not.toHaveBeenCalled();
        expect((screen.getByText("Follow in this chat") as HTMLButtonElement).disabled).toBe(true);
    });
    it("defaults to all accepted friends and starts only after an explicit source selection and click", async () => {
        render(<FriendStreamsPanel friends={[friend]} presence={[]}/>);
        await screen.findByText("Agent API · My source");
        fireEvent.change(screen.getByLabelText("Chat to share"), { target: { value: "agent_api:source-run" } });
        fireEvent.change(screen.getByLabelText("Activity description"), { target: { value: "Building" } });
        fireEvent.click(screen.getByText("Start sharing"));
        await waitFor(() => expect(f.start).toHaveBeenCalledWith({ kind: "agent_api", ref: "source-run", title: "My source" }, { kind: "friends" }, "Building"));
    });
    it("requires an explicit audience target when sharing with selected friends or a room", async () => {
        render(<FriendStreamsPanel friends={[friend]} presence={[]} profileHandle="guest"/>);
        expect(screen.getByText("Signed in as @guest")).toBeTruthy();
        await screen.findByText("Agent API · My source");
        fireEvent.change(screen.getByLabelText("Chat to share"), { target: { value: "agent_api:source-run" } });
        const audience = screen.getByLabelText("Sharing audience");
        const start = screen.getByRole<HTMLButtonElement>("button", { name: "Start sharing" });
        fireEvent.change(audience, { target: { value: "selected" } });
        expect(start.disabled).toBe(true);
        fireEvent.click(screen.getByRole("checkbox", { name: "@alex" }));
        fireEvent.click(start);
        await waitFor(() => expect(f.start).toHaveBeenCalledWith(expect.anything(), { kind: "selected", profiles: ["alice"] }, ""));
        await waitFor(() => expect(start.disabled).toBe(false));
        fireEvent.change(audience, { target: { value: "room" } });
        expect(start.disabled).toBe(true);
        fireEvent.change(screen.getByLabelText("Stream audience room"), { target: { value: " room:dojo " } });
        fireEvent.click(start);
        await waitFor(() => expect(f.start).toHaveBeenLastCalledWith(expect.anything(), { kind: "room", room_id: "room:dojo" }, ""));
    });
    it("follows only the explicitly selected exact paired destination", async () => {
        const fetcher = vi.fn(async (_url: string) => new Response(JSON.stringify({ binding: { status: "active", reasoning_binding_id: "binding-b", binding_epoch: 4, helix_conversation_id: "chat-b" } })));
        vi.stubGlobal("fetch", fetcher);
        const { rerender } = render(<FriendStreamsPanel friends={[friend]} presence={[]} activeChatId="chat-b"/>);
        await screen.findByText("Connection test passed.");
        fireEvent.click(screen.getByText("Use current paired Codex chat"));
        await screen.findByText("Receive as context in: codex · chat-b");
        fireEvent.click(screen.getByText("Follow in this chat"));
        await waitFor(() => expect(f.follow).toHaveBeenCalledWith(preview, { kind: "codex", ref: "binding-b", epoch: 4, conversation_id: "chat-b" }, "node", "follow"));
        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(fetcher.mock.calls[0]?.[0]).toContain("helix_conversation_id=chat-b");
        rerender(<FriendStreamsPanel friends={[friend]} presence={[]} activeChatId="chat-c"/>);
        expect((screen.getByText("Follow in this chat") as HTMLButtonElement).disabled).toBe(true);
    });
    it("does not follow a Codex destination after the native installation disappears", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
            binding: { status: "active", reasoning_binding_id: "binding-b", binding_epoch: 4, helix_conversation_id: "chat-b" },
        }))));
        render(<FriendStreamsPanel friends={[friend]} presence={[]} activeChatId="chat-b"/>);
        fireEvent.click(screen.getByText("Use current paired Codex chat"));
        await screen.findByText("Receive as context in: codex · chat-b");
        f.nativeInstallation = null;
        fireEvent.click(await screen.findByText("Follow in this chat"));
        expect((await screen.findByRole("alert")).textContent).toContain("The desktop connection is unavailable");
        expect(f.follow).not.toHaveBeenCalled();
    });
    it("restores navigation choices on reopen without starting or following, and clears them for another account", async () => {
        const first = render(<FriendStreamsPanel friends={[friend]} presence={[]}/>);
        await screen.findByText("Agent API · My source");
        fireEvent.change(screen.getByLabelText("Chat to share"), { target: { value: "agent_api:source-run" } });
        fireEvent.change(screen.getByLabelText("Sharing audience"), { target: { value: "room" } });
        fireEvent.change(screen.getByLabelText("Stream audience room"), { target: { value: "room:dojo" } });
        fireEvent.change(screen.getByLabelText("Agent API receiving run"), { target: { value: "receiver" } });
        fireEvent.click(screen.getByText("Select API run"));
        first.unmount();
        const reopened = render(<FriendStreamsPanel friends={[friend]} presence={[]}/>);
        await screen.findByText("Agent API · My source");
        expect((screen.getByLabelText("Chat to share") as HTMLSelectElement).value).toBe("agent_api:source-run");
        expect((screen.getByLabelText("Stream audience room") as HTMLInputElement).value).toBe("room:dojo");
        expect(screen.getByText("Receive as context in: agent_api · receiver")).toBeTruthy();
        expect(f.start).not.toHaveBeenCalled();
        expect(f.follow).not.toHaveBeenCalled();
        reopened.unmount();
        f.profile = "other"; f.revision++;
        render(<FriendStreamsPanel friends={[friend]} presence={[]}/>);
        expect(screen.getByText("Receive as context in: Choose a destination")).toBeTruthy();
        expect((screen.getByLabelText("Chat to share") as HTMLSelectElement).value).toBe("");
    });
    it("rejects a restored Codex selection when its binding expired while the panel was closed", async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            binding: { status: "active", reasoning_binding_id: "binding-b", binding_epoch: 4, helix_conversation_id: "chat-b" },
        })));
        vi.stubGlobal("fetch", fetcher);
        const first = render(<FriendStreamsPanel friends={[friend]} presence={[]} activeChatId="chat-b"/>);
        fireEvent.click(screen.getByText("Use current paired Codex chat"));
        await screen.findByText("Receive as context in: codex · chat-b");
        first.unmount();
        fetcher.mockResolvedValue(new Response(JSON.stringify({ binding: null })));
        render(<FriendStreamsPanel friends={[friend]} presence={[]} activeChatId="chat-b"/>);
        fireEvent.click(await screen.findByText("Follow in this chat"));
        expect((await screen.findByRole("alert")).textContent).toContain("pairing changed or expired");
        expect(f.follow).not.toHaveBeenCalled();
        expect(screen.getByText("Receive as context in: Choose a destination")).toBeTruthy();
    });
});
