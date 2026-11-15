import React from "react";
import { z } from "zod";

const taskSchema = z.object({
  id: z.string(), objective: z.string(),
  profile: z.enum(["movement", "material_handoff", "construction"]),
  generation: z.number().int().positive(),
  revision: z.number().int().positive(),
  status: z.enum(["active", "waiting", "completed", "cancelled"]),
  clarification: z.object({ question: z.string(),
    task_revision: z.number().int().positive() }).nullable(),
}).passthrough();
const residentSchema = z.object({
  session_id: z.string(), status: z.enum(["running", "paused", "stopped"]),
  world_id: z.string(), companion_id: z.string(),
  capabilities: z.array(z.string()), expires_at: z.string(),
  available_profiles: z.array(z.enum(["movement", "material_handoff",
    "construction"])).optional(),
  hold_reason: z.string().nullable(), active_task: taskSchema.nullable(),
  completion_available: z.boolean().optional(),
  loop: z.object({ model_in_flight: z.boolean(),
    local_in_flight: z.boolean(), closed: z.boolean(),
    ordered_events: z.number() }).nullable(),
  progress: z.object({ program_version: z.number().int().positive().nullable(),
    steps_completed: z.number().int().nonnegative(),
    revision_required: z.boolean(),
    revision_reason: z.string().nullable() }).nullable().optional(),
  performance: z.object({ model_revision_attempts: z.number().int().nonnegative(),
    model_revision_latency_ms: z.array(z.number().nullable()),
    observed_actor_motion_during_model_wait_blocks:
      z.array(z.number().nullable()) }).nullable().optional(),
}).passthrough();
type Resident = z.infer<typeof residentSchema>;

/** Owner-facing task controls. Stop has its own request lane and invalidates
 * late ordinary responses, so a busy model or UI request cannot hide it. */
export function CompanionResidentControl({ requestId, reviewRevision }: {
  requestId: string; reviewRevision: string }) {
  const base = `/api/desktop/setup-contract/requests/${
    encodeURIComponent(requestId)}/companion/resident`;
  const [resident, setResident] = React.useState<Resident | null>(null);
  const [objective, setObjective] = React.useState("");
  const [profile, setProfile] = React.useState<
    "movement" | "material_handoff" | "construction">("movement");
  const [answer, setAnswer] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [targetCheck, setTargetCheck] = React.useState<{
    taskId: string; generation: number; verified: boolean;
    offset?: number; checked?: number; total?: number;
    nextOffset?: number | null;
    reason: string | null; differences?: Array<{
      x: number; y: number; z: number; expected: string;
      actual: string }> } | null>(null);
  const stopEpoch = React.useRef(0);
  const stopPending = React.useRef(false);

  const read = React.useCallback(async () => {
    const epoch = stopEpoch.current;
    const response = await fetch(base, { credentials: "same-origin",
      cache: "no-store", headers: { Accept: "application/json" } });
    const body: unknown = await response.json().catch(() => null);
    if (epoch !== stopEpoch.current || stopPending.current) return;
    const parsed = z.object({ ok: z.literal(true),
      companion_resident: residentSchema }).passthrough().safeParse(body);
    if (!response.ok || !parsed.success)
      throw new Error(response.status === 404
        ? "The companion controller is not connected in this EXE."
        : "The companion status could not be read.");
    setResident(parsed.data.companion_resident);
  }, [base]);
  React.useEffect(() => {
    let active = true;
    const poll = () => {
      const epoch = stopEpoch.current;
      void read().catch(error => {
      if (active && epoch === stopEpoch.current && !stopPending.current)
        setMessage(error instanceof Error ? error.message :
        "The companion status could not be read.");
    }); };
    poll();
    const timer = window.setInterval(poll, 3_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [read]);

  const post = async (path: string, payload: unknown,
    operation: string, stop = false) => {
    const epoch = stop ? ++stopEpoch.current : stopEpoch.current;
    if (stop) stopPending.current = true;
    if (!stop) setBusy(true);
    try {
      const response = await fetch(`${base}${path}`, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json",
          "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body: unknown = await response.json().catch(() => null);
      const parsed = z.object({ ok: z.literal(true),
        companion_resident: residentSchema }).passthrough().safeParse(body);
      if (!response.ok || !parsed.success)
        throw new Error(`Companion ${operation} was not confirmed.`);
      if (epoch !== stopEpoch.current) return;
      setResident(parsed.data.companion_resident);
      if (["task start", "cancel", "Stop"].includes(operation))
        setTargetCheck(null);
      setMessage(`Companion ${operation} confirmed.`);
      if (operation === "task start") setObjective("");
      if (operation === "answer") setAnswer("");
    } catch (error) {
      if (epoch === stopEpoch.current)
        setMessage(error instanceof Error ? error.message :
          `Companion ${operation} was not confirmed.`);
    } finally {
      if (stop) {
        // Reads started during Stop may contain the earlier running state.
        stopEpoch.current++;
        stopPending.current = false;
      } else setBusy(false);
    }
  };
  const task = resident?.active_task;
  const measureTargets = async (offset = 0) => {
    const measuredTask = resident?.active_task;
    if (!measuredTask || measuredTask.profile !== "construction") return;
    const epoch = stopEpoch.current;
    setBusy(true);
    try {
      const response = await fetch(`${base}/measure?offset=${offset}`, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const body: unknown = await response.json().catch(() => null);
      const parsed = z.object({ ok: z.literal(true),
        build_targets: z.object({ verified: z.boolean(),
          reason: z.string().nullable(), taskId: z.string(),
          generation: z.number().int().positive(),
          offset: z.number().int().nonnegative().optional(),
          checked: z.number().int().positive().optional(),
          total: z.number().int().positive().optional(),
          nextOffset: z.number().int().nonnegative().nullable().optional(),
          differences: z.array(z.object({ x: z.number().int(),
            y: z.number().int(), z: z.number().int(),
            expected: z.string(), actual: z.string() }))
            .max(8).optional() }) })
        .passthrough().safeParse(body);
      if (!response.ok || !parsed.success ||
          parsed.data.build_targets.taskId !== measuredTask.id ||
          parsed.data.build_targets.generation !== measuredTask.generation)
        throw new Error("The placed blocks could not be checked right now.");
      if (epoch !== stopEpoch.current || stopPending.current) return;
      setTargetCheck(parsed.data.build_targets);
      setMessage(parsed.data.build_targets.reason === "resident_build_page_checked"
        ? "This area matches fresh block measurements. Continue checking the remaining areas; this is not a completion proof."
        : parsed.data.build_targets.verified
        ? "Recorded block targets match fresh world measurements. The full structure still needs a separate completion check."
        : `Recorded block targets need attention: ${
          parsed.data.build_targets.reason ?? "measurement unavailable"}.`);
    } catch (error) {
      if (epoch === stopEpoch.current && !stopPending.current)
        setMessage(error instanceof Error ? error.message :
          "The placed blocks could not be checked right now.");
    } finally { setBusy(false); }
  };
  const prepareActor = async (install: boolean) => {
    const epoch = stopEpoch.current;
    setBusy(true);
    try {
      const response = await fetch(`${base}/${install
        ? "native/install" : "actor/prepare"}`, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json",
          "Content-Type": "application/json" },
        body: JSON.stringify({ expected_revision: reviewRevision }),
      });
      const body: unknown = await response.json().catch(() => null);
      const result = z.object({ ok: z.literal(true),
        actor_prepare: z.object({ state: z.literal(
          "local_one_use_ticket_staged") }).optional(),
        native_install: z.object({ state: z.literal(
          "local_one_use_ticket_staged") }).optional(),
      }).passthrough().safeParse(body);
      if (!response.ok || !result.success || !(install
        ? result.data.native_install : result.data.actor_prepare)) {
        const denial = z.object({ error: z.string().regex(
          /^(?:(?:resident_(?:actor|source|desktop|session)|room_(?:connection|owner|source))_[a-z_]+|companion_resident_(?:native_unavailable|review_changed|actor_prepare_not_staged))$/u) }).safeParse(body);
        if (!install && denial.success)
          throw new Error(`Companion preparation held: ${denial.data.error}.`);
        throw new Error(install
          ? "The companion could not be connected to this session."
          : "The companion could not be prepared in this world.");
      }
      if (epoch !== stopEpoch.current || stopPending.current) return;
      setMessage(install
        ? "Companion connection staged. Wait for Minecraft to confirm it."
        : "Companion preparation staged. Wait for it to appear in Minecraft, then connect it.");
    } catch (error) {
      if (epoch !== stopEpoch.current || stopPending.current) return;
      setMessage(error instanceof Error ? error.message :
        "The companion could not be prepared.");
    } finally { setBusy(false); }
  };
  const active = resident?.status === "running";
  return <section className="mt-3 rounded border border-cyan-300/30 p-3"
    aria-label="Companion tasks">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">Companion tasks</h3>
      <button data-helix-control-id="workstation.panel.agent-access.companion-resident-control.stop-now" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" className="rounded border border-rose-300/60 px-3 py-1 text-rose-100"
        onClick={() => void post("/stop", {}, "Stop", true)}>Stop now</button>
    </div>
    <p className="mt-1 text-xs text-slate-300">
      {resident ? `${resident.status} in ${resident.world_id}; actor ${resident.companion_id}. Session ends ${
        new Date(resident.expires_at).toLocaleString()}.` :
        "Waiting for the installed companion controller."}
    </p>
    {resident ? <>
      <p className="mt-1 text-xs text-slate-300">Selected: {resident.capabilities.join(", ")}.</p>
      {resident.hold_reason ? <p className="mt-1 text-xs text-amber-200">
        Waiting: {resident.hold_reason}</p> : null}
      {resident.status !== "stopped" ? <div className="mt-2 flex flex-wrap gap-2">
        <button data-helix-control-id="workstation.panel.agent-access.companion-resident-control.prepare-companion-in-minecraft" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" disabled={busy}
          onClick={() => void prepareActor(false)}
          className="rounded border border-white/30 px-3 py-1 disabled:opacity-50">
          Prepare companion in Minecraft</button>
        <button data-helix-control-id="workstation.panel.agent-access.companion-resident-control.connect-prepared-companion" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" disabled={busy}
          onClick={() => void prepareActor(true)}
          className="rounded border border-white/30 px-3 py-1 disabled:opacity-50">
          Connect prepared companion</button>
      </div> : null}
      {task ? <p className="mt-2 text-sm">{task.objective} · {task.status}
        {resident.loop?.model_in_flight ? " · deciding" : ""}
        {resident.loop?.local_in_flight ? " · acting" : ""}</p> :
        <p className="mt-2 text-xs text-slate-300">No active task.</p>}
      {resident.progress ? <p className="mt-1 text-xs text-slate-300">
        Program {resident.progress.program_version ?? "pending"} · {
          resident.progress.steps_completed} completed step(s)
        {resident.progress.revision_required ? ` · revising after ${
          resident.progress.revision_reason ?? "a change"}` : ""}
      </p> : null}
      {resident.performance ? <p className="mt-1 text-xs text-slate-300">
        Decisions checked: {resident.performance.model_revision_attempts}
        {resident.performance.model_revision_latency_ms.at(-1) != null ?
          ` · latest wait ${Math.round(resident.performance
            .model_revision_latency_ms.at(-1)!)} ms` : ""}
        {resident.performance.observed_actor_motion_during_model_wait_blocks
          .at(-1) != null ?
          ` · companion moved ${resident.performance
            .observed_actor_motion_during_model_wait_blocks.at(-1)} blocks during that wait`
          : ""}
      </p> : null}
      {task?.clarification ? <div className="mt-2 space-y-2">
        <label className="block text-sm">{task.clarification.question}
          <input data-helix-control-id="workstation.panel.agent-access.companion-resident-control.input" data-helix-interaction-kind="configure" data-helix-authority-state="client_local" value={answer} onChange={event => setAnswer(event.target.value)}
            maxLength={1_024} className="mt-1 w-full rounded border border-white/20 bg-slate-950 p-2" />
        </label>
        <button data-helix-control-id="workstation.panel.agent-access.companion-resident-control.send-answer" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" disabled={busy || !active || !answer.trim()}
          onClick={() => void post("/answer", {
            expected_revision: reviewRevision, task_id: task.id,
            task_generation: task.generation,
            task_revision: task.clarification!.task_revision,
            answer: answer.trim() }, "answer")}
          className="rounded border border-cyan-300/40 px-3 py-1 disabled:opacity-50">
          Send answer</button>
      </div> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {resident.status === "paused" ? <button data-helix-control-id="workstation.panel.agent-access.companion-resident-control.resume" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button"
          disabled={busy} onClick={() => void post("/resume", {}, "resume")}
          className="rounded border border-white/30 px-3 py-1 disabled:opacity-50">
          Resume</button> : null}
        {active ? <button data-helix-control-id="workstation.panel.agent-access.companion-resident-control.pause" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" disabled={busy}
          onClick={() => void post("/pause", {}, "pause")}
          className="rounded border border-white/30 px-3 py-1 disabled:opacity-50">
          Pause</button> : null}
        {task && ["active", "waiting"].includes(task.status) ? <button data-helix-control-id="workstation.panel.agent-access.companion-resident-control.cancel-task" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local"
          type="button" disabled={busy} onClick={() => void post("/cancel", {}, "cancel")}
          className="rounded border border-white/30 px-3 py-1 disabled:opacity-50">
          Cancel task</button> : null}
        {task?.status === "active" && task.profile === "construction" ?
          <button data-helix-control-id="workstation.panel.agent-access.companion-resident-control.check-planned-blocks" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" disabled={busy}
            onClick={() => void measureTargets(0)}
            className="rounded border border-white/30 px-3 py-1 disabled:opacity-50">
            Check planned blocks</button> : null}
        {task?.status === "active" &&
          resident.completion_available !== false ?
          <button data-helix-control-id="workstation.panel.agent-access.companion-resident-control.void-post-complete-completion-check" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" disabled={busy}
          onClick={() => void post("/complete", {}, "completion check")}
          className="rounded border border-white/30 px-3 py-1 disabled:opacity-50">
            {task.profile === "construction" ? "Verify planned build" :
              "Verify completion"}</button> : null}
      </div>
      {targetCheck && task?.profile === "construction" &&
        targetCheck.taskId === task.id &&
        targetCheck.generation === task.generation ?
        <div className="mt-1 text-xs text-slate-300">
          <p>Placed block check: {targetCheck.verified ? "matching" :
            targetCheck.reason === "resident_build_page_checked"
              ? "this area matches" : targetCheck.reason ?? "incomplete"}.
            {targetCheck.offset !== undefined && targetCheck.checked &&
              targetCheck.total ? ` Checked ${targetCheck.offset + 1}–${
                targetCheck.offset + targetCheck.checked} of ${
                targetCheck.total} recorded blocks.` : ""}</p>
          {targetCheck.differences?.map(row => <p key={`${row.x},${row.y},${row.z}`}>
            At {row.x}, {row.y}, {row.z}: expected {row.expected},
            found {row.actual}.
          </p>)}
          {targetCheck.nextOffset !== undefined &&
            targetCheck.nextOffset !== null ? <button data-helix-control-id="workstation.panel.agent-access.companion-resident-control.check-next-area" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button"
              disabled={busy} onClick={() => void measureTargets(
                targetCheck.nextOffset!)}
              className="mt-1 rounded border border-white/30 px-3 py-1 disabled:opacity-50">
              Check next area</button> : null}
        </div> : null}
      {active && (!task || ["completed", "cancelled"].includes(task.status)) ?
        <div className="mt-3 space-y-2">
          <label className="block text-sm">What should the companion do?
            <textarea data-helix-control-id="workstation.panel.agent-access.companion-resident-control.textarea" data-helix-interaction-kind="configure" data-helix-authority-state="client_local" value={objective} onChange={event =>
              setObjective(event.target.value)} maxLength={4_096}
              className="mt-1 w-full rounded border border-white/20 bg-slate-950 p-2" />
          </label>
          <select data-helix-control-id="workstation.panel.agent-access.companion-resident-control.select" data-helix-interaction-kind="configure" data-helix-authority-state="client_local" value={profile} onChange={event => setProfile(event.target.value as
            typeof profile)} className="rounded border border-white/20 bg-slate-950 p-2">
            {(resident.available_profiles ?? ["movement", "material_handoff",
              "construction"]).includes("movement") ?
              <option value="movement">Movement</option> : null}
            {(resident.available_profiles ?? ["movement", "material_handoff",
              "construction"]).includes("material_handoff") ?
              <option value="material_handoff">Material handoff</option> : null}
            {(resident.available_profiles ?? ["movement", "material_handoff",
              "construction"]).includes("construction") ?
              <option value="construction">Construction</option> : null}
          </select>
          <button data-helix-control-id="workstation.panel.agent-access.companion-resident-control.start-task" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" disabled={busy || !objective.trim() ||
            resident.available_profiles?.length === 0}
            onClick={() => void post("/task", { expected_revision: reviewRevision,
              task_id: `task:${crypto.randomUUID()}`,
              objective: objective.trim(), profile }, "task start")}
            className="ml-2 rounded border border-cyan-300/40 px-3 py-1 disabled:opacity-50">
            Start task</button>
        </div> : null}
    </> : null}
    {message ? <p role="status" className="mt-2 text-xs text-amber-200">{message}</p> : null}
    <p className="mt-2 text-xs text-slate-400">F10 in Minecraft is the direct local Stop.</p>
  </section>;
}
