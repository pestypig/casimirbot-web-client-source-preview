import { RoomReviewScope, type RoomReviewOperation } from "./RoomReviewScope";
import { useState } from "react";

type FabricSource = { binding_id: string; world_id: string;
  domain_adapter: "minecraft.fabric_mod.v1"; status: "active" };
type Request = { release_id: string; actor_ref: string;
  audience: "gpt_live" | "paired_codex" | "responses"; review_until: string };

const readFailureMessage = (error: unknown): string => {
  const code = error instanceof Error
    ? /^([a-z_]+)(?: \(HTTP \d{3}\))?$/.exec(error.message)?.[1] : undefined;
  switch (code) {
    case "source_binding_forbidden":
      return "The room service denied this source review. Check the selected room owner's read-only source approval. Room chat and source access are separate permissions. (source_binding_forbidden)";
    case "insufficient_scope":
      return "This room connection lacks the source-review scope. Review room-service authorization for the same account before retrying. (insufficient_scope)";
    case "room_connection_required":
      return "Refresh the room connection. If disconnected, authorize the room service with this same account. (room_connection_required)";
    case "room_forbidden":
      return "Open the selected room in the browser and verify the owner account and current membership. (room_forbidden)";
    default:
      return "The player sharing review could not be read. Check this room's source access and retry.";
  }
};

const isFabricSource = (value: unknown): value is FabricSource =>
  Boolean(value && typeof value === "object" &&
    typeof (value as { binding_id?: unknown }).binding_id === "string" &&
    typeof (value as { world_id?: unknown }).world_id === "string" &&
    (value as { domain_adapter?: unknown }).domain_adapter ===
      "minecraft.fabric_mod.v1" &&
    (value as { status?: unknown }).status === "active");

const isRequest = (value: unknown): value is Request =>
  Boolean(value && typeof value === "object" &&
    /^minecraft_player_release:[0-9a-f-]{36}$/u.test(String(
      (value as { release_id?: unknown }).release_id)) &&
    /^observed_actor:[0-9a-f]{24}$/u.test(String(
      (value as { actor_ref?: unknown }).actor_ref)) &&
    ["gpt_live", "paired_codex", "responses"].includes(String(
      (value as { audience?: unknown }).audience)) &&
    Number.isFinite(Date.parse(String(
      (value as { review_until?: unknown }).review_until))));

/** Native read-only review; player confirmation is a separate authority. */
type NativeMinecraftPlayerSharingQueueProps = Readonly<{
  roomId: string;
  control: (request: Record<string, unknown>) => Promise<unknown>;
}>;
export function NativeMinecraftPlayerSharingQueue(props: NativeMinecraftPlayerSharingQueueProps) {
  return <RoomReviewScope scopeKey={props.roomId}>{run =>
    <NativeMinecraftPlayerSharingQueueSession {...props} run={run} />}</RoomReviewScope>;
}

function NativeMinecraftPlayerSharingQueueSession({ roomId, control: unscopedControl, run }: NativeMinecraftPlayerSharingQueueProps & { run: RoomReviewOperation }) {
  const control = (request: Record<string, unknown>) => run(() => unscopedControl(request));
  const [sources, setSources] = useState<FabricSource[]>([]);
  const [bindingId, setBindingId] = useState("");
  const [requests, setRequests] = useState<Request[]>([]);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (selectedBindingId?: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setRequests([]);
    try {
      let exactBindingId = selectedBindingId;
      if (!exactBindingId) {
        const inventory = await control({ operation: "source_list", room_id: roomId }) as
          { schema?: unknown; room_id?: unknown; bindings?: unknown };
        if (inventory?.schema !== "casimir.native_hosted_room_source_inventory.v1" ||
            inventory.room_id !== roomId || !Array.isArray(inventory.bindings))
          throw new Error("The Fabric source inventory is unavailable.");
        const current = inventory.bindings.filter(isFabricSource);
        setSources(current);
        exactBindingId = current[0]?.binding_id;
      }
      setBindingId(exactBindingId ?? "");
      if (exactBindingId) {
        const result = await control({ operation: "source_player_release_requests",
          room_id: roomId, request: { binding_id: exactBindingId } }) as
          { schema?: unknown; room_id?: unknown; binding_id?: unknown;
            activation_available?: unknown; requests?: unknown };
        if (result?.schema !== "helix.minecraft_player_release_review.v1" ||
            result.room_id !== roomId || result.binding_id !== exactBindingId ||
            result.activation_available !== false ||
            !Array.isArray(result.requests) || !result.requests.every(isRequest))
          throw new Error("The player sharing review is unavailable.");
        setRequests(result.requests);
      }
      setChecked(true);
    } catch (error) {
      setChecked(false);
      setError(readFailureMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return <section aria-label="Minecraft player sharing requests"
    className="mt-3 rounded border border-cyan-300/20 p-2 text-xs">
    <h4 className="font-semibold text-cyan-100">Minecraft player sharing requests</h4>
    <p className="mt-1 text-slate-300">A Fabric request is not permission to share a player's
      game state. Each player must approve their own finite release separately.</p>
    <button data-helix-control-id="helix.ask.shared_live_room.native-minecraft-player-sharing-queue.void-refresh" data-helix-interaction-kind="human_only" data-helix-authority-state="blocked_pending_contract" type="button" disabled={busy} onClick={() => void refresh()}
      className="mt-2 rounded border border-cyan-300/30 px-2 py-1 disabled:opacity-50">
      {checked ? "Refresh sharing requests" : "Check sharing requests"}
    </button>
    {sources.length > 1 ? <label className="ml-2">Fabric world <select data-helix-control-id="helix.ask.shared_live_room.native-minecraft-player-sharing-queue.fabric-world-for-sharing-requests" data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract"
      aria-label="Fabric world for sharing requests" value={bindingId} disabled={busy}
      onChange={(event) => void refresh(event.target.value)}
      className="ml-1 rounded border border-white/20 bg-slate-900 px-2 py-1">
      {sources.map((source) => <option key={source.binding_id}
        value={source.binding_id}>{source.world_id}</option>)}
    </select></label> : null}
    {error ? <p role="alert" className="mt-2 text-amber-100">{error}</p> : null}
    {checked && !sources.length ? <p className="mt-2 text-slate-400">
      No active Fabric source is bound to this room.</p> : null}
    {checked && bindingId && !requests.length ? <p className="mt-2 text-slate-400">
      No pending player sharing requests for this source.</p> : null}
    {requests.length ? <ul className="mt-2 space-y-2">
      {requests.map((item, index) => <li key={item.release_id}
        className="rounded border border-white/10 p-2">
        Request {index + 1} · {item.audience === "gpt_live" ? "GPT Live" :
          item.audience === "responses" ? "Responses AI" : "Paired Codex"} · review before {new Date(item.review_until).toLocaleString()}
        <span className="block break-all font-mono text-slate-400">
          {item.actor_ref}</span>
      </li>)}
    </ul> : null}
  </section>;
}
