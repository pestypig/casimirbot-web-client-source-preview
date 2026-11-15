import { FRIEND_BOARD_ROOT, type FriendBoardMessage, type FriendBoardPage, type FriendGlyphArtifact } from "@shared/helix-friend-board";
export async function boardRequest<T>(path: string, body?: object): Promise<T> {
    const response = await fetch(`${FRIEND_BOARD_ROOT}${path}`, { method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.schema !== "helix.friend_board.response.v1" || !data.ok) {
        const message = data?.error === "friend_board_picker_changed" ? "A newer glyph replaced that picker item. Select the latest glyph again." :
            data?.error === "friend_board_friendship_required" ? "New messages and shared page changes require an accepted friendship." :
                data?.error === "friend_board_request_conflict" ? "That message request changed. Review it and send again." :
                    "The friend board request could not complete. Check the connection and try again.";
        throw new Error(data?.message ?? message);
    }
    return data;
}
export type BoardMessages = {
    own_profile_id: string;
    messages: FriendBoardMessage[];
    last_sequence: number;
    can_send: boolean;
};
export type BoardState = {
    pages: FriendBoardPage[];
    last_sequence: number;
    can_send: boolean;
};
export type LatestGlyph = {
    artifact: FriendGlyphArtifact;
    digest: string;
};
export type LocalGlyphCandidate = {
    generation_id: string;
    request_id?: string;
    phase: "pending" | "verified" | "finalized" | "failed";
    artifact?: FriendGlyphArtifact;
};
export const boardPeerPath = (peer: string) => `/${encodeURIComponent(peer)}`;
