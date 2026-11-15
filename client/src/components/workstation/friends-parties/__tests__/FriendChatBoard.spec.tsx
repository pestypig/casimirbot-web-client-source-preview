/** @vitest-environment jsdom */
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { FriendChatBoard } from "../FriendChatBoard";
import { createHandTableScenario } from "@shared/physics-glyphs/scenario-example";
import { friendGlyphArtifactSchema, glyphArtifactPresentation } from "@shared/helix-friend-board";
const api = vi.hoisted(() => ({ request: vi.fn(), revision: 0 }));
vi.mock("@/lib/workstation/accountCapabilityPolicy", () => ({
    HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT: "test:account-changed",
    readCachedAccountCapabilityPolicy: () => ({ account_type: "user" }),
    readCachedAccountProfileIdentity: () => ({ profileId: "alice", revision: api.revision }),
}));
vi.mock("@/components/helix/ask-console/shared-live-room/NativeHostedRoomTaskPanel", () => ({
    NativeHostedRoomTaskPanel: ({ roomId }: { roomId: string }) => <div>Owner review for {roomId}</div>,
}));
vi.mock("@/components/helix/ask-console/shared-live-room/NativeSharedRoomReportsPanel", () => ({
    NativeSharedRoomReportsPanel: ({ roomId }: { roomId: string }) => <div>Shared reports for {roomId}</div>,
}));
vi.mock("../FriendBoardApi", () => ({ boardRequest: api.request, boardPeerPath: (p: string) => `/${p}` }));
vi.mock("../FriendArtifactWorkspace", () => ({ FriendArtifactWorkspace: () => <div>Isolated copy opened</div> }));
const scenario = createHandTableScenario();
const artifact = friendGlyphArtifactSchema.parse({ schema: "helix.friend_glyph_artifact.v1", kind: "physics_glyph", generation_id: "11111111-1111-4111-8111-111111111111", renderer: "physics-glyph-story.v1", document: { schema: "helix.physics_glyph_document.v1", configuration: { preset: "scenario", scenario, perspective: scenario.perspectives[0] } } });
const message = { id: "a".repeat(64), sequence: 1, author_id: "alice", text: "Read the assumptions", artifact, artifact_digest: "b".repeat(64), created_at: new Date().toISOString(), depth: 0, page_version: 0, page_actor: null };
const friends = [{ state: "accepted", peer: { profile_id: "bob", handle: "bob", display_name: "Bob" } }] as never;
beforeEach(() => {
    api.revision++;
    vi.stubGlobal("crypto", webcrypto);
    vi.clearAllMocks();
    api.request.mockImplementation(async (path: string) => {
        if (path === "/threads")
            return { threads: [] };
        if (path.endsWith("/messages"))
            return { own_profile_id: "alice", messages: [message], last_sequence: 1, can_send: true };
        if (path.endsWith("/state"))
            return { pages: [], last_sequence: 1, can_send: true };
        if (path === "/latest")
            return { latest: { artifact, digest: "b".repeat(64) } };
        if (path === "/local-candidate")
            return { candidate: null };
        return { message };
    });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("friend artifact chat board", () => {
    it("reopens the selected conversation but drops unsent drafts and independent workspaces", async () => {
        const first = render(<FriendChatBoard friends={friends}/>);
        fireEvent.change(screen.getByLabelText("Friend chat recipient"), { target: { value: "bob" } });
        await screen.findByText("Read the assumptions");
        fireEvent.change(screen.getByLabelText("Friend message"), { target: { value: "unsent draft" } });
        fireEvent.click(screen.getByText("Open independent workspace copy"));
        first.unmount();
        render(<FriendChatBoard friends={friends}/>);
        await screen.findByText("Read the assumptions");
        expect((screen.getByLabelText("Friend chat recipient") as HTMLSelectElement).value).toBe("bob");
        expect((screen.getByLabelText("Friend message") as HTMLTextAreaElement).value).toBe("");
        expect(screen.queryByText("Isolated copy opened")).toBeNull();
        expect(api.request.mock.calls.some(([path]) => path.endsWith("/send"))).toBe(false);
    });
    it.each(["owner", "guest"])("reads the exact hosted room and shows controls for the admitted %s", async (role) => {
        const id = "shared_realtime_room:dojo";
        const fetcher = vi.fn(async (_input: string, init?: RequestInit) => new Response(JSON.stringify(init?.method === "POST"
            ? { schema: "helix.shared_live_room.inspect_receipt.v1", ok: true, room: { room_id: id, title: "Dojo",
                status: "active", self_participant_id: "seat-a", participants: [{ participant_id: "seat-a", display_name: "Alice", role }] } }
            : { schema: "casimir_desktop_room_connection_status/1", ready: true, authority: "https://casimirbot.com",
                profile_ref: "alice", expires_at: new Date(Date.now() + 60_000).toISOString() })));
        vi.stubGlobal("fetch", fetcher);
        render(<FriendChatBoard friends={friends}/>);
        fireEvent.change(screen.getByLabelText("Friend chat recipient"), { target: { value: "bob" } });
        fireEvent.click(screen.getByRole("button", { name: "Review hosted room mission" }));
        expect(fetcher).not.toHaveBeenCalled();
        fireEvent.change(screen.getByLabelText("Hosted room ID"), { target: { value: id } });
        fireEvent.click(screen.getByRole("button", { name: "Open room mission" }));
        expect(await screen.findByText(`Shared reports for ${id}`)).toBeTruthy();
        expect(Boolean(screen.queryByText(`Owner review for ${id}`))).toBe(role === "owner");
        expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({ operation: "inspect", room_id: id });
        fireEvent.change(screen.getByLabelText("Friend chat recipient"), { target: { value: "" } });
        expect(screen.queryByText(`Shared reports for ${id}`)).toBeNull();
    });
    it("opens hosted room controls only after a separate action for an accepted friend", async () => {
        const openRoom = vi.fn();
        render(<FriendChatBoard friends={friends} onOpenHostedRoom={openRoom}/>);
        fireEvent.change(screen.getByLabelText("Friend chat recipient"), { target: { value: "bob" } });
        await screen.findByText("Read the assumptions");
        fireEvent.change(screen.getByLabelText("Friend message"), { target: { value: "⚛ Meet at the waypoint" } });
        fireEvent.click(screen.getByText("Send message"));
        await waitFor(() => expect(api.request).toHaveBeenCalledWith("/bob/send", expect.objectContaining({ text: "⚛ Meet at the waypoint" })));
        expect(openRoom).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Open hosted room controls" }));
        expect(openRoom).toHaveBeenCalledExactlyOnceWith("bob");
    });
    it("shows a sticker and its context, then opens an independent copy on demand", async () => {
        render(<FriendChatBoard friends={friends}/>);
        fireEvent.change(screen.getByLabelText("Friend chat recipient"), { target: { value: "bob" } });
        await screen.findByText("Read the assumptions");
        expect(screen.getByText(`Slide 1 of ${glyphArtifactPresentation(artifact).slides}`)).toBeTruthy();
        expect(screen.getByText("Artifact context")).toBeTruthy();
        expect(screen.queryByText("Isolated copy opened")).toBeNull();
        fireEvent.click(screen.getByText("Open independent workspace copy"));
        expect(screen.getByText("Isolated copy opened")).toBeTruthy();
    });
    it("selects only the latest first-slide thumbnail and sends its pinned generation/digest", async () => {
        render(<FriendChatBoard friends={friends}/>);
        fireEvent.change(screen.getByLabelText("Friend chat recipient"), { target: { value: "bob" } });
        await screen.findByText("Read the assumptions");
        fireEvent.click(screen.getByText("Emoji & artifacts"));
        fireEvent.click(await screen.findByRole("button", { name: "Select latest Physics Glyph sticker" }));
        fireEvent.click(screen.getByText("Send message"));
        await waitFor(() => expect(api.request).toHaveBeenCalledWith("/bob/send", expect.objectContaining({ generation_id: artifact.generation_id, artifact_digest: "b".repeat(64) })));
    });
    it("never offers a previous completed sticker as the new in-flight generation", async () => {
        const original = api.request.getMockImplementation()!;
        api.request.mockImplementation(async (path: string, ...rest: unknown[]) => path === "/local-candidate" ? { candidate: { generation_id: "pending", phase: "pending" } } : original(path, ...rest));
        render(<FriendChatBoard friends={friends}/>);
        fireEvent.change(screen.getByLabelText("Friend chat recipient"), { target: { value: "bob" } });
        await screen.findByText("Read the assumptions");
        fireEvent.click(screen.getByText("Emoji & artifacts"));
        await screen.findByText("A new composition is still running. Wait for completion.");
        expect(screen.queryByRole("button", { name: "Select latest Physics Glyph sticker" })).toBeNull();
    });
    it("ignores a stale page response after receiving a newer shared cursor", async () => {
        vi.useFakeTimers();
        let finish!: (r: unknown) => void;
        const original = api.request.getMockImplementation()!;
        api.request.mockImplementation(async (path: string, ...rest: unknown[]) => path.endsWith("/page") ? new Promise(resolve => { finish = resolve; }) :
            path.endsWith("/state") ? { pages: [{ id: message.id, depth: 2, page_version: 2, page_actor: "bob" }], last_sequence: 1, can_send: true } : original(path, ...rest));
        render(<FriendChatBoard friends={friends}/>);
        fireEvent.change(screen.getByLabelText("Friend chat recipient"), { target: { value: "bob" } });
        await act(async () => { });
        fireEvent.click(screen.getByRole("button", { name: "Next sticker slide" }));
        await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
        expect(screen.getByText(`Slide 3 of ${glyphArtifactPresentation(artifact).slides}`)).toBeTruthy();
        await act(async () => { finish({ page: { id: message.id, depth: 1, page_version: 1, page_actor: "alice" } }); });
        expect(screen.getByText(`Slide 3 of ${glyphArtifactPresentation(artifact).slides}`)).toBeTruthy();
    });
});
