import { afterEach, describe, it, expect, vi } from "vitest";
import { streamRequest, friendStreamsApi } from "../FriendStreamsApi";
afterEach(() => vi.unstubAllGlobals());
describe("shared chat requests", () => {
    it("preserves a typed Friends connection failure for the recovery control", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
            error: "friends_parties_connection_required",
        }), { status: 401 })));
        await expect(streamRequest("/start", {})).rejects.toMatchObject({
            code: "friends_parties_connection_required",
            message: "Connect Friends & Parties on this installation to load or share chat updates.",
        });
    });
    it("explains a changed selected update without treating it as a sign-in failure", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ schema: "helix.friend_stream.response.v1", ok: false, error: "friend_stream_selection_changed" }), { status: 409 })));
        await expect(streamRequest("/follow", {})).rejects.toThrow("The shared chat or update changed. Refresh the card and choose it again.");
    });
    it("binds one-time receiving to the displayed revision and update identity", async () => {
        const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ schema: "helix.friend_stream.response.v1", ok: true })));
        vi.stubGlobal("fetch", fetcher);
        await friendStreamsApi.follow({ publisher_id: "alice", revision: "revision-selected", event_key: "event-selected" }, { kind: "agent_api", ref: "run-b" }, "node-b", "once");
        const init = fetcher.mock.calls[0][1] as RequestInit;
        expect(JSON.parse(init.body as string)).toMatchObject({ expected_revision: "revision-selected", expected_event_key: "event-selected", mode: "once" });
        expect(init).toMatchObject({ credentials: "same-origin", cache: "no-store" });
    });
    it("does not reflect unknown upstream error codes into the screen", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "private-upstream-diagnostic" }), { status: 503 })));
        await expect(streamRequest("/")).rejects.toThrow("Shared chats are temporarily unavailable.");
    });
});
