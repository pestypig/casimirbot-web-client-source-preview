import React, { useEffect, useRef, useState } from "react";
import { nativeRoomInstructionCatalogSchema } from "@shared/helix-hosted-room-instruction";
import { helixNativeReviewedBuildPlanSchema } from "@shared/helix-native-reviewed-build-plan";
import { NATIVE_HOSTED_ROOM_BASE_PATH as BASE } from "@shared/helix-native-hosted-room-mission";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";

type BuildRegionDraft = { from: string; to: string; block: string };
const emptyBuildRegion = (): BuildRegionDraft => ({ from: "", to: "", block: "" });
const parseBlockPosition = (text: string) => {
  const parts = text.trim().split(/\s+/u);
  return { x: Number(parts[0]), y: Number(parts[1]), z: Number(parts[2]) };
};

export function NativeRoomInstructionsPanel({ roomId, authority, disabled = false }: { roomId: string; authority: string; disabled?: boolean }) {
  const [catalog, setCatalog] = useState<ReturnType<typeof nativeRoomInstructionCatalogSchema.parse> | null>(null);
  const [selected, setSelected] = useState(""), [approved, setApproved] = useState(false);
  const [worldPairIndex, setWorldPairIndex] = useState("");
  const [buildPlanEnabled, setBuildPlanEnabled] = useState(false);
  const [buildRegions, setBuildRegions] = useState<BuildRegionDraft[]>([emptyBuildRegion()]);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const generation = useRef(0), pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const clear = () => { generation.current++; pending.current?.abort(); pending.current = null;
      setCatalog(null); setSelected(""); setWorldPairIndex("");
      setBuildPlanEnabled(false); setBuildRegions([emptyBuildRegion()]);
      setApproved(false); setBusy(false); setMessage(""); };
    clear(); window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear);
    return () => { generation.current++; pending.current?.abort(); window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear); };
  }, [roomId, authority, disabled]);
  const run = async (queue: boolean) => {
    if (pending.current || disabled || (queue && (!approved || !catalog?.captures.some(c => c.handoff_id === selected)))) return;
    const epoch = generation.current, controller = new AbortController();
    const reviewed = catalog;
    const selectedWorldPair = worldPairIndex === "" ? null :
      reviewed?.minecraft_world_pairs[Number(worldPairIndex)] ?? null;
    let expectedBuild: ReturnType<typeof helixNativeReviewedBuildPlanSchema.parse> | null = null;
    if (queue && buildPlanEnabled) {
      if (!selectedWorldPair || buildRegions.some(region =>
        region.from.trim().split(/\s+/u).length !== 3 ||
        region.to.trim().split(/\s+/u).length !== 3)) {
        setMessage("Select a Minecraft world and enter three integer coordinates for each corner.");
        return;
      }
      const parsed = helixNativeReviewedBuildPlanSchema.safeParse({
        schema: "helix.native_reviewed_build_plan.v1",
        regions: buildRegions.map(region => ({
          from: parseBlockPosition(region.from), to: parseBlockPosition(region.to),
          expected_block: region.block.trim(),
        })),
      });
      if (!parsed.success) {
        setMessage("Review each exact block region: ordered corners, a namespaced block ID, no overlap, at most 15×33×15 per region and 4096 cells total.");
        return;
      }
      expectedBuild = parsed.data;
    }
    pending.current = controller;
    const timer = setTimeout(() => controller.abort(), 20000);
    setBusy(true); setMessage(""); setApproved(false);
    if (!queue) { setCatalog(null); setSelected(""); setWorldPairIndex(""); }
    try {
      const response = await fetch(queue ? `${BASE}/dispatch` : `${BASE}/${encodeURIComponent(roomId)}/instructions`, {
        method: queue ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json", ...(queue ? { "Content-Type": "application/json" } : {}) },
        ...(queue ? { body: JSON.stringify({ room_id: roomId, selection_ref: reviewed!.selection_ref,
          selection_revision: reviewed!.selection_revision, handoff_id: selected,
          use_reviewed_transfer: true,
          ...(selectedWorldPair ? { minecraft_world: {
            hosted_source_binding_id: selectedWorldPair.hosted_source_binding_id,
            local_environment_binding_id:
              selectedWorldPair.local_environment_binding_id,
            ...(expectedBuild ? { expected_build: expectedBuild } : {}) } } : {}) }) } : {}),
        signal: controller.signal });
      const value = await response.json();
      if (epoch !== generation.current) return;
      if (controller.signal.aborted) throw new Error("request_expired");
      if (!response.ok) throw new Error("unconfirmed");
      if (queue) {
        if (value?.schema !== "helix.native_hosted_room_dispatch.v1" || value.ok !== true || value.instruction_queued !== true ||
            value.task_pickup_confirmed !== false || value.execution_authority !== false || value.answer_authority !== false ||
            value.raw_content_included !== false || value.terminal_eligible !== false) throw new Error("invalid");
        if (selectedWorldPair && (value.minecraft_world_identity_match !== true ||
            value.minecraft_command_authority_granted !== false)) throw new Error("invalid");
        setCatalog(null); setSelected(""); setWorldPairIndex("");
        setBuildPlanEnabled(false); setBuildRegions([emptyBuildRegion()]);
        setMessage(selectedWorldPair
          ? "The reviewed instruction was queued with a current same-world check. Task pickup and Minecraft command authority remain separate."
          : "Instruction queued for the selected task. Task pickup and execution are not yet confirmed.");
      } else {
        const parsed = nativeRoomInstructionCatalogSchema.parse(value);
        if (parsed.room_id !== roomId || parsed.authority !== authority) throw new Error("changed");
        setCatalog(parsed);
      }
    } catch { if (epoch === generation.current) { setCatalog(null); setSelected(""); setMessage(queue
      ? "Queueing could not be confirmed. Refresh and retry the same capture and selection to reuse its delivery identity. An expired or missing transfer needs a new browser review."
      : "Captured instructions are unavailable. Check the selected task, room connection, pairing and consent."); } }
    finally { clearTimeout(timer); if (epoch === generation.current) { pending.current = null; setBusy(false); } }
  };
  return <section aria-label="Native room instructions" className="mt-3 rounded border border-white/20 p-3 text-xs">
    <p>Room instructions</p>
    <p>First review and transfer the full speech in the room browser. Loading here reads capture metadata only.</p>
    <button data-helix-control-id="helix.ask.shared_live_room.native-room-instructions-panel.load-captured-instructions" data-helix-interaction-kind="human_only" data-helix-authority-state="blocked_pending_contract" type="button" disabled={busy || disabled} onClick={() => void run(false)}>Load captured instructions</button>
    {catalog ? <>
      <p>Selected task: {catalog.task_label} · revision {catalog.selection_revision}</p>
      {catalog.minecraft_world_pairs.length ? <label className="block">
        Minecraft world for this instruction (optional)
        <select data-helix-control-id="helix.ask.shared_live_room.native-room-instructions-panel.minecraft-world-for-reviewed-instruction" data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" aria-label="Minecraft world for reviewed instruction"
          value={worldPairIndex} disabled={busy || disabled}
          onChange={event => { setWorldPairIndex(event.target.value);
            setBuildPlanEnabled(false); setBuildRegions([emptyBuildRegion()]);
            setApproved(false); }}>
          <option value="">General instruction; no Minecraft world check</option>
          {catalog.minecraft_world_pairs.map((pair, index) =>
            <option key={`${pair.hosted_source_binding_id}:${pair.local_environment_binding_id}`}
              value={String(index)}>{pair.world_id}</option>)}
        </select>
        <span className="block">A same-world check only helps the task use current evidence. Minecraft commands still require their own owner-approved authority.</span>
      </label> : null}
      {worldPairIndex !== "" ? <div className="mt-2 rounded border border-white/20 p-2">
        <label><input data-helix-control-id="helix.ask.shared_live_room.native-room-instructions-panel.input" data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" type="checkbox" checked={buildPlanEnabled} disabled={busy || disabled}
          onChange={event => { setBuildPlanEnabled(event.target.checked); setApproved(false); }} />Attach an exact expected block outcome for later verification</label>
        {buildPlanEnabled ? <>
          <p>Enter inclusive minimum and maximum block coordinates as X Y Z. Each region must expect one namespaced block ID. This records an outcome to check; it does not allow a command or declare a build complete.</p>
          {buildRegions.map((region, index) => <div key={index} className="mt-2 rounded border border-white/20 p-2">
            <label>Region {index + 1} from <input data-helix-control-id="helix.ask.shared_live_room.native-room-instructions-panel.52-69-4" data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" aria-label={`Region ${index + 1} minimum X Y Z`}
              value={region.from} placeholder="-52 69 4" disabled={busy || disabled}
              onChange={event => { setBuildRegions(current => current.map((row, rowIndex) =>
                rowIndex === index ? { ...row, from: event.target.value } : row)); setApproved(false); }} /></label>
            <label> to <input data-helix-control-id="helix.ask.shared_live_room.native-room-instructions-panel.48-71-4" data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" aria-label={`Region ${index + 1} maximum X Y Z`}
              value={region.to} placeholder="-48 71 4" disabled={busy || disabled}
              onChange={event => { setBuildRegions(current => current.map((row, rowIndex) =>
                rowIndex === index ? { ...row, to: event.target.value } : row)); setApproved(false); }} /></label>
            <label> expected block <input data-helix-control-id="helix.ask.shared_live_room.native-room-instructions-panel.minecraft-stone-bricks" data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" aria-label={`Region ${index + 1} expected block`}
              value={region.block} placeholder="minecraft:stone_bricks" disabled={busy || disabled}
              onChange={event => { setBuildRegions(current => current.map((row, rowIndex) =>
                rowIndex === index ? { ...row, block: event.target.value } : row)); setApproved(false); }} /></label>
            {buildRegions.length > 1 ? <button data-helix-control-id="helix.ask.shared_live_room.native-room-instructions-panel.remove-region" data-helix-interaction-kind="human_only" data-helix-authority-state="blocked_pending_contract" type="button" disabled={busy || disabled}
              onClick={() => { setBuildRegions(current => current.filter((_, rowIndex) => rowIndex !== index)); setApproved(false); }}>Remove region</button> : null}
          </div>)}
          <button data-helix-control-id="helix.ask.shared_live_room.native-room-instructions-panel.add-region" data-helix-interaction-kind="human_only" data-helix-authority-state="blocked_pending_contract" type="button" disabled={busy || disabled || buildRegions.length >= 16}
            onClick={() => { setBuildRegions(current => [...current, emptyBuildRegion()]); setApproved(false); }}>Add region</button>
        </> : null}
      </div> : null}
      <select data-helix-control-id="helix.ask.shared_live_room.native-room-instructions-panel.captured-instruction-to-queue" data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" aria-label="Captured instruction to queue" value={selected} disabled={busy || disabled}
        onChange={event => { setSelected(event.target.value); setApproved(false); }}>
        <option value="">Choose the reviewed capture</option>
        {catalog.captures.map(c => <option key={c.handoff_id} value={c.handoff_id}>
          {new Date(c.captured_at_ms).toLocaleTimeString()} · {c.speaker_participant_id} · {c.transcript_text_char_count} characters
        </option>)}
      </select>
      {selected ? <>
        <p>Capture: <code>{selected}</code></p>
        <label><input data-helix-control-id="helix.ask.shared_live_room.native-room-instructions-panel.input.2" data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" type="checkbox" disabled={busy || disabled} checked={approved} onChange={event => setApproved(event.target.checked)} />Queue the owner-reviewed instruction for this task using its connected AI account{worldPairIndex !== "" ? " with this Minecraft world check" : ""}{buildPlanEnabled ? " and the exact expected block regions shown above" : ""}.</label>
        <button data-helix-control-id="helix.ask.shared_live_room.native-room-instructions-panel.queue-reviewed-instruction" data-helix-interaction-kind="human_only" data-helix-authority-state="blocked_pending_contract" type="button" disabled={busy || disabled || !approved} onClick={() => void run(true)}>Queue reviewed instruction</button>
      </> : null}
    </> : null}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
