import { FRIEND_STREAM_ROOT, type FriendStreamPreview, type FriendStreamSource, type FriendStreamAudience, type FriendStreamDestination, type FriendStreamSubscription } from "@shared/helix-friend-stream";
const messages: Record<string, string> = {
    friends_parties_connection_required: "Connect Friends & Parties on this installation to load or share chat updates.",
    friend_stream_selection_changed: "The shared chat or update changed. Refresh the card and choose it again.",
    friend_stream_changed: "Sharing changed while this request was running. Refresh and try the action again.",
    friend_stream_publisher_unavailable: "This publishing session is no longer current. Start sharing again.",
    friend_stream_active_on_another_installation: "This profile is already sharing from another installation. Stop that stream before starting here.",
    friend_stream_source_unavailable: "The selected chat is unavailable for this account.",
    friend_stream_audience_unavailable: "Choose accepted friends for this audience.",
    friend_stream_room_unavailable: "Open Hosted service rooms and verify membership in the selected room, then retry sharing.",
    friend_stream_subscription_limit: "Stop an existing subscription before adding another.",
    friend_stream_no_update: "This stream has no published update to add yet.",
    friend_stream_unavailable: "This stream is no longer shared with you.",
    friend_stream_private_or_imported_content: "Remove imported context or credential material before sharing this selected text.",
};
export async function streamRequest<T>(path: string, body?: object): Promise<T> {
    const response = await fetch(`${FRIEND_STREAM_ROOT}${path}`, { method: body ? "POST" : "GET",
        credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.schema !== "helix.friend_stream.response.v1" || !data.ok)
        throw Object.assign(new Error(messages[data?.error] ?? data?.message ?? "Shared chats are temporarily unavailable. Retry when the service is reachable."),
            { code: typeof data?.error === "string" ? data.error : null });
    return data;
}
export type StreamList = {
    own_profile_id?: string;
    previews: FriendStreamPreview[];
    subscriptions: FriendStreamSubscription[];
};
export const friendStreamsApi = {
    list: () => streamRequest<StreamList>("/"),
    sources: () => streamRequest<{
        sources: FriendStreamSource[];
    }>("/sources"),
    start: (source: FriendStreamSource, audience: FriendStreamAudience, installation_id: string, activity: string) => streamRequest<{
        preview: FriendStreamPreview;
    }>("/start", { source, audience, installation_id, activity }),
    stop: () => streamRequest("/stop", {}),
    retire: (revision: string, installation_id: string) => streamRequest("/retire", { revision, installation_id }),
    follow: (preview: Pick<FriendStreamPreview, "publisher_id" | "revision" | "event_key">, destination: FriendStreamDestination, installation_id: string, mode: "follow" | "once") => streamRequest("/follow", {
        publisher_id: preview.publisher_id, expected_revision: preview.revision, expected_event_key: preview.event_key, destination, installation_id, mode
    }),
    unfollow: (id: string) => streamRequest("/unfollow", { id }),
};
