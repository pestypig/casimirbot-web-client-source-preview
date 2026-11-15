import { useEffect, useState } from "react";
import type { HelixSharedLiveRoomSourceBindingProjection } from
  "@shared/contracts/helix-shared-live-room-agent.v1";

type PendingRequest = {
  release_id: string;
  actor_ref: string;
  audience: "gpt_live" | "paired_codex" | "responses";
  requested_at: string;
  review_until: string;
  expires_at: string;
};

const sourcePath = (roomId: string, suffix = "") =>
  `/api/agi/realtime/rooms/${encodeURIComponent(roomId)}/source-bindings${suffix}`;

const readJson = async (path: string): Promise<Record<string, unknown>> => {
  const response = await fetch(path, {
    credentials: "same-origin", cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (response.status === 404) throw new Error(
    "Player sharing review is not available for this room.");
  if (!response.ok) throw new Error(
    "Player sharing review could not be read. Check your room access and try again.");
  const data = await response.json() as unknown;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(
    "Player sharing review returned an invalid response.");
  return data as Record<string, unknown>;
};

const isBinding = (value: unknown): value is HelixSharedLiveRoomSourceBindingProjection =>
  Boolean(value && typeof value === "object" &&
    typeof (value as { binding_id?: unknown }).binding_id === "string" &&
    typeof (value as { source_label?: unknown }).source_label === "string" &&
    (value as { domain_adapter?: unknown }).domain_adapter === "minecraft.fabric_mod.v1" &&
    (value as { status?: unknown }).status === "active");

const isPendingRequest = (value: unknown): value is PendingRequest =>
  Boolean(value && typeof value === "object" &&
    /^minecraft_player_release:[0-9a-f-]{36}$/u.test(String(
      (value as { release_id?: unknown }).release_id)) &&
    /^observed_actor:[0-9a-f]{24}$/u.test(String(
      (value as { actor_ref?: unknown }).actor_ref)) &&
    ["gpt_live", "paired_codex", "responses"].includes(String(
      (value as { audience?: unknown }).audience)) &&
    ["requested_at", "review_until", "expires_at"].every((field) => {
      const date = (value as Record<string, unknown>)[field];
      return typeof date === "string" && Number.isFinite(Date.parse(date));
    }));

/** Read-only owner review. A source assertion never becomes sharing consent here. */
export function MinecraftPlayerSharingQueue({ roomId }: Readonly<{ roomId: string }>) {
  const [bindings, setBindings] = useState<HelixSharedLiveRoomSourceBindingProjection[]>([]);
  const [selectedBindingId, setSelectedBindingId] = useState("");
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBindings([]);
    setSelectedBindingId("");
    setRequests([]);
    setChecked(false);
    setError(null);
  }, [roomId]);

  const readRequests = async (bindingId: string) => {
    const response = await readJson(sourcePath(roomId,
      `/${encodeURIComponent(bindingId)}/player-release-requests`));
    if (response.schema !== "helix.minecraft_player_release_review.v1" ||
        response.ok !== true || response.binding_id !== bindingId ||
        response.activation_available !== false ||
        !Array.isArray(response.requests) ||
        !response.requests.every(isPendingRequest)) throw new Error(
      "Player sharing review returned an invalid response.");
    setRequests(response.requests);
  };

  const refresh = async (bindingId?: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setRequests([]);
    try {
      let exactBindingId = bindingId;
      if (!exactBindingId) {
        const response = await readJson(sourcePath(roomId));
        if (response.ok !== true || !Array.isArray(response.bindings)) throw new Error(
          "Room source bindings returned an invalid response.");
        const activeFabric = response.bindings.filter(isBinding);
        setBindings(activeFabric);
        exactBindingId = activeFabric[0]?.binding_id;
      }
      setSelectedBindingId(exactBindingId ?? "");
      if (exactBindingId) await readRequests(exactBindingId);
      setChecked(true);
    } catch (cause) {
      setChecked(false);
      setError(cause instanceof Error ? cause.message :
        "Player sharing review could not be read.");
    } finally {
      setBusy(false);
    }
  };

  return <section aria-label="Minecraft player sharing requests"
    className="mt-4 rounded-lg border border-cyan-200/20 bg-cyan-300/[0.04] p-3">
    <h4 className="text-sm font-semibold text-white">Minecraft player sharing requests</h4>
    <p className="mt-1 text-xs text-slate-300">
      A request from the Fabric source is not permission to share a player's game state.
      This view cannot approve one.
    </p>
    <button type="button" disabled={busy} onClick={() => void refresh()}
      className="mt-2 rounded border border-cyan-200/40 px-3 py-1 text-xs text-cyan-100 disabled:opacity-50">
      {checked ? "Refresh sharing requests" : "Check sharing requests"}
    </button>
    {bindings.length > 1 ? <label className="ml-2 text-xs text-slate-200">
      Fabric source <select aria-label="Fabric source" value={selectedBindingId}
        disabled={busy} onChange={(event) => void refresh(event.target.value)}
        className="ml-1 rounded border border-white/25 bg-[#071329] px-2 py-1">
        {bindings.map((binding) => <option key={binding.binding_id}
          value={binding.binding_id}>{binding.source_label}</option>)}
      </select>
    </label> : null}
    {error ? <p role="alert" className="mt-2 text-xs text-amber-200">{error}</p> : null}
    {checked && !bindings.length ? <p className="mt-2 text-xs text-slate-300">
      No active Fabric source is bound to this room.
    </p> : null}
    {checked && selectedBindingId && !requests.length ? <p className="mt-2 text-xs text-slate-300">
      No current player sharing requests for this source.
    </p> : null}
    {requests.length ? <ul className="mt-2 space-y-2 text-xs text-slate-200">
      {requests.map((request, index) => <li key={request.release_id}
        className="rounded border border-white/10 p-2">
        <strong>Request {index + 1}</strong> · {request.audience === "gpt_live"
          ? "GPT Live" : request.audience === "responses" ? "Responses AI" : "Paired Codex"} · review before {
            new Date(request.review_until).toLocaleString()}
        <span className="mt-1 block break-all font-mono text-slate-400">
          {request.actor_ref}
        </span>
      </li>)}
    </ul> : null}
  </section>;
}
