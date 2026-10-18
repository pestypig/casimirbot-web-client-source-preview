import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CircleStop, Pause, Play, RotateCcw, StepForward } from "lucide-react";
import {
  advanceMotorcycleAwareness,
  createMotorcycleAwarenessState,
  fixtureIdentityHash,
  type MotorcycleAwarenessState,
  type MotorcycleReplayFixture,
} from "@shared/helix-motorcycle-awareness";
import {
  DEFAULT_MOTORCYCLE_REPLAY_FIXTURE,
  MOTORCYCLE_REPLAY_FIXTURES,
} from "@shared/helix-motorcycle-awareness-fixtures";
import { HUD_SURFACE_SCHEMA, type HudScene, type HudSurfaceRenderReceipt, type SurfaceFrame, type SurfaceSourceBinding } from "@shared/helix-hud-surface";
import HudSurfaceHost from "./hud-surface/HudSurfaceHost";
import MotorcycleHudRenderer from "./motorcycle-awareness/MotorcycleHudRenderer";
import VisualSequenceInspector from "./visual-sequence/VisualSequenceInspector";
import SurfaceRegistryStatus from "./hud-surface/SurfaceRegistryStatus";

type ReplaySession = {
  frameIndex: number;
  state: MotorcycleAwarenessState;
};

const SOURCE_PLACEHOLDERS = [
  ["Frozen replay", true],
  ["Minecraft sensing", false],
  ["FiveM bridge", false],
  ["Physical sensors", false],
] as const;

function resetSession(): ReplaySession {
  return { frameIndex: -1, state: createMotorcycleAwarenessState() };
}

function advanceSession(session: ReplaySession, fixture: MotorcycleReplayFixture): ReplaySession {
  const nextFrameIndex = session.frameIndex + 1;
  const nextFrame = fixture.frames[nextFrameIndex];
  if (!nextFrame) return session;
  return {
    frameIndex: nextFrameIndex,
    state: advanceMotorcycleAwareness(session.state, nextFrame),
  };
}

function Metric({ label, value, tone = "text-slate-100" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className={`mt-1 font-mono text-sm ${tone}`}>{value}</div>
    </div>
  );
}

function RadarScope({ fixture, frameIndex }: { fixture: MotorcycleReplayFixture; frameIndex: number }) {
  const frame = frameIndex >= 0 ? fixture.frames[frameIndex] : null;
  return (
    <div className="relative aspect-square min-h-[210px] overflow-hidden rounded-full border border-emerald-300/20 bg-[radial-gradient(circle,rgba(16,185,129,0.13)_0,rgba(2,6,23,0.75)_62%)]">
      {[25, 50, 75].map((size) => (
        <div key={size} className="absolute left-1/2 top-1/2 rounded-full border border-emerald-200/10" style={{ width: `${size}%`, height: `${size}%`, transform: "translate(-50%, -50%)" }} />
      ))}
      <div className="absolute left-1/2 top-0 h-full w-px bg-emerald-200/10" />
      <div className="absolute left-0 top-1/2 h-px w-full bg-emerald-200/10" />
      <div className="absolute left-1/2 top-1/2 h-3 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-cyan-100" title="motorcycle" />
      {(frame?.tracks ?? []).map((track) => {
        const radius = Math.min(43, Math.max(8, track.rangeM / 2));
        const radians = (track.bearingBikeDeg * Math.PI) / 180;
        const left = 50 - Math.sin(radians) * radius;
        const top = 50 - Math.cos(radians) * radius;
        return (
          <div
            key={`${track.trackId}:${track.sequence}`}
            className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300 shadow-[0_0_14px_rgba(252,211,77,0.9)]"
            style={{ left: `${left}%`, top: `${top}%` }}
            title={`${track.trackId}: ${track.rangeM.toFixed(1)} m`}
          />
        );
      })}
      <div className="absolute left-1/2 top-2 -translate-x-1/2 font-mono text-[9px] tracking-widest text-emerald-200/50">FRONT</div>
    </div>
  );
}

export default function MotorcycleHudLabPanel() {
  const [fixtureId, setFixtureId] = useState(DEFAULT_MOTORCYCLE_REPLAY_FIXTURE.id);
  const [session, setSession] = useState<ReplaySession>(resetSession);
  const [playing, setPlaying] = useState(false);
  const [hudElement, setHudElement] = useState<HTMLDivElement | null>(null);
  const [hudSurfaceReceipt, setHudSurfaceReceipt] = useState<HudSurfaceRenderReceipt | null>(null);
  const [registryBlankRequest, setRegistryBlankRequest] = useState(0);

  const fixture = useMemo(
    () => MOTORCYCLE_REPLAY_FIXTURES.find((candidate) => candidate.id === fixtureId) ?? DEFAULT_MOTORCYCLE_REPLAY_FIXTURE,
    [fixtureId],
  );
  const currentFrame = session.frameIndex >= 0 ? fixture.frames[session.frameIndex] : null;
  const surfaceAtMs = currentFrame?.atMs ?? 0;
  const surfaceBinding = useMemo<SurfaceSourceBinding>(() => ({
    schema: HUD_SURFACE_SCHEMA,
    profileId: "motorcycle-awareness",
    runId: `fixture:${fixture.id}`,
    sourceId: "synthetic-road-underlay",
    producerEpoch: `fixture:${fixture.id}:epoch-1`,
    sourceKind: "simulator",
    locatorRef: "fixture:hudh-0a-synthetic-road-v1",
    permission: "not_required",
    retention: "none",
  }), [fixture.id]);
  const surfaceFrame = useMemo<SurfaceFrame>(() => ({
    schema: HUD_SURFACE_SCHEMA,
    frameId: `synthetic-road:${fixture.id}:${Math.max(0, session.frameIndex)}`,
    sourceId: surfaceBinding.sourceId,
    producerEpoch: surfaceBinding.producerEpoch,
    sequence: Math.max(0, session.frameIndex),
    capturedAtMs: surfaceAtMs,
    freshnessDeadlineMs: surfaceAtMs + 1_000,
    width: 1280,
    height: 720,
    colorSpace: "srgb",
    alphaMode: "opaque",
    provenanceRef: "fixture:hudh-0a-synthetic-road-v1",
    contentClass: "synthetic_fixture",
  }), [fixture.id, session.frameIndex, surfaceAtMs, surfaceBinding.producerEpoch, surfaceBinding.sourceId]);
  const hudScene = useMemo<HudScene>(() => ({
    schema: HUD_SURFACE_SCHEMA,
    sceneId: `motorcycle-scene:${fixture.id}:${Math.max(0, session.frameIndex)}`,
    profileId: surfaceBinding.profileId,
    producerEpoch: surfaceBinding.producerEpoch,
    revision: Math.max(0, session.frameIndex),
    authoredAtMs: surfaceAtMs,
    freshnessDeadlineMs: surfaceAtMs + 1_000,
    normalizedViewport: "unit_rect_top_left_v1",
    primitives: [{
      primitiveId: "motorcycle-eight-sector-layer",
      kind: "profile_surface",
      xNorm: 0,
      yNorm: 0,
      widthNorm: 1,
      heightNorm: 1,
      rotationDeg: 0,
      opacity: 1,
      styleToken: "motorcycle-eight-sector-v1",
      semanticRef: fixtureIdentityHash(session.state.activeCues),
    }],
  }), [fixture.id, session.frameIndex, session.state.activeCues, surfaceAtMs, surfaceBinding.producerEpoch, surfaceBinding.profileId]);
  const latestReceipt = session.state.receipts.at(-1);
  const complete = session.frameIndex >= fixture.frames.length - 1;
  const oraclePassed = complete
    && session.state.blankReason === fixture.expected.finalBlankReason
    && JSON.stringify(session.state.activeCues.map((cue) => cue.sector)) === JSON.stringify(fixture.expected.finalActiveSectors)
    && session.state.rejectedObservationCount >= fixture.expected.minimumRejectedObservations;

  useEffect(() => {
    if (!playing) return;
    if (complete) {
      setPlaying(false);
      return;
    }
    const timer = window.setInterval(() => {
      setSession((current) => advanceSession(current, fixture));
    }, 650);
    return () => window.clearInterval(timer);
  }, [complete, fixture, playing]);

  const selectFixture = (id: string) => {
    setFixtureId(id);
    setSession(resetSession());
    setPlaying(false);
  };

  const runToEnd = () => {
    setSession((current) => {
      let next = current;
      while (next.frameIndex < fixture.frames.length - 1) next = advanceSession(next, fixture);
      return next;
    });
    setPlaying(false);
  };

  return (
    <section className="flex h-full min-h-[650px] flex-col overflow-auto bg-[#060a12] text-slate-100" data-testid="motorcycle-hud-lab">
      <header className="border-b border-cyan-300/15 bg-slate-950/90 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-wide text-cyan-100">Motorcycle HUD Lab</h1>
              <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-amber-200">simulation only</span>
              <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-emerald-200">offline deterministic</span>
            </div>
            <p className="mt-1 max-w-3xl text-xs text-slate-400">MHUD-1A validates observation admission → coordinate transform → threat controller → HUD admission → shared renderer. It has no road-use or physical safety authority.</p>
          </div>
          <div className="rounded border border-violet-300/20 bg-violet-400/5 px-3 py-2 text-right">
            <div className="text-[10px] uppercase tracking-[0.16em] text-violet-300">Runtime Codex</div>
            <div className="font-mono text-xs text-slate-400">disabled · future semantic supervisor</div>
          </div>
        </div>
      </header>

      <div className="grid gap-3 border-b border-white/10 bg-slate-950/60 p-3 lg:grid-cols-[minmax(260px,1fr)_auto]">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[260px] flex-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">
            Frozen scenario
            <select className="mt-1 w-full rounded-md border border-white/10 bg-slate-900 px-2.5 py-2 text-sm normal-case tracking-normal text-slate-100" value={fixtureId} onChange={(event) => selectFixture(event.target.value)}>
              {MOTORCYCLE_REPLAY_FIXTURES.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}
            </select>
          </label>
          <button type="button" className="rounded-md border border-cyan-300/20 bg-cyan-400/10 p-2 text-cyan-100 hover:bg-cyan-400/20" onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Pause replay" : "Play replay"}>{playing ? <Pause size={17} /> : <Play size={17} />}</button>
          <button type="button" className="rounded-md border border-white/10 bg-white/5 p-2 hover:bg-white/10 disabled:opacity-40" onClick={() => setSession((current) => advanceSession(current, fixture))} disabled={complete} aria-label="Step replay"><StepForward size={17} /></button>
          <button type="button" className="rounded-md border border-white/10 bg-white/5 p-2 hover:bg-white/10" onClick={() => { setSession(resetSession()); setPlaying(false); }} aria-label="Reset replay"><RotateCcw size={17} /></button>
          <button type="button" className="rounded-md border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100 hover:bg-emerald-400/20" onClick={runToEnd}>Run fixture</button>
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label="Environment source modes">
          {SOURCE_PLACEHOLDERS.map(([label, enabled]) => (
            <button key={label} type="button" disabled={!enabled} className={`rounded border px-2 py-1 text-[10px] ${enabled ? "border-cyan-300/30 bg-cyan-400/10 text-cyan-100" : "cursor-not-allowed border-white/5 bg-white/[0.02] text-slate-600"}`} title={enabled ? "Active source" : "Reserved for a later work packet"}>{label}</button>
          ))}
        </div>
      </div>

      <main className="grid flex-1 gap-3 p-3 xl:grid-cols-[0.82fr_1.45fr_1fr]">
        <div className="space-y-3">
          <article className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
            <div className="mb-2 flex items-center justify-between"><h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200">Bike-relative sensor oracle</h2><span className="font-mono text-[10px] text-slate-500">frame {Math.max(0, session.frameIndex + 1)}/{fixture.frames.length}</span></div>
            <RadarScope fixture={fixture} frameIndex={session.frameIndex} />
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{fixture.description}</p>
          </article>
          <article className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Source evidence</h2>
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Tracks" value={String(currentFrame?.tracks.length ?? 0)} />
              <Metric label="Head yaw" value={currentFrame?.pose ? `${currentFrame.pose.yawBikeDeg.toFixed(0)}°` : "—"} />
              <Metric label="Rejected" value={String(session.state.rejectedObservationCount)} tone={session.state.rejectedObservationCount ? "text-amber-200" : "text-slate-100"} />
              <Metric label="Watchdog" value={session.state.blankReason === "watchdog" ? "TRIPPED" : "armed"} tone={session.state.blankReason === "watchdog" ? "text-red-300" : "text-emerald-200"} />
            </div>
          </article>
        </div>

        <div className="space-y-3">
          <div>
            <HudSurfaceHost
              profileLabel="Motorcycle eight-sector HUD"
              atMs={surfaceAtMs}
              binding={surfaceBinding}
              frame={surfaceFrame}
              scene={hudScene}
              manualBlank={session.state.blankReason === "manual_blank"}
              emergencyStop={session.state.blankReason === "emergency_stop"}
              initialMode="hud_over_source"
              feedRef={setHudElement}
              onReceiptChange={setHudSurfaceReceipt}
            >
              <MotorcycleHudRenderer cues={session.state.activeCues} blankReason={session.state.blankReason} mode="transparent" className="h-full min-h-0 w-full rounded-none border-0" />
            </HudSurfaceHost>
            <div className="mt-2 grid grid-cols-5 gap-1 text-center text-[9px] uppercase tracking-wide text-slate-500" aria-label="HUD reaction state legend">
              <div className="rounded border border-white/5 px-1 py-1.5"><span className="mx-auto mb-1 block h-1.5 w-6 rounded bg-slate-700" />off</div>
              <div className="rounded border border-cyan-300/10 px-1 py-1.5"><span className="mx-auto mb-1 block h-1.5 w-6 rounded bg-cyan-300/40" />dim/info</div>
              <div className="rounded border border-amber-300/10 px-1 py-1.5"><span className="mx-auto mb-1 block h-1.5 w-7 rounded bg-amber-300/60" />moderate</div>
              <div className="rounded border border-orange-300/10 px-1 py-1.5"><span className="mx-auto mb-1 block h-1.5 w-8 rounded bg-orange-400/80" />urgent</div>
              <div className="rounded border border-red-300/10 px-1 py-1.5"><span className="mx-auto mb-1 block h-1.5 w-9 rounded bg-red-400" />pulse</div>
            </div>
          </div>

          <article className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
            <div className="mb-2 flex items-center justify-between"><h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Track → threat → cue</h2><span className="text-[10px] text-slate-500">safety priority before navigation</span></div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="text-[9px] uppercase tracking-wider text-slate-600"><tr><th className="pb-2">Track</th><th className="pb-2">Bike</th><th className="pb-2">Head</th><th className="pb-2">TTC</th><th className="pb-2">Sector</th><th className="pb-2">Decision</th></tr></thead>
                <tbody className="font-mono text-slate-300">
                  {session.state.threats.length ? session.state.threats.map((threat) => (
                    <tr key={threat.trackId} className="border-t border-white/5"><td className="py-2">{threat.trackId}</td><td>{threat.bikeBearingDeg.toFixed(0)}°</td><td>{threat.headBearingDeg.toFixed(0)}°</td><td>{threat.timeToCollisionS === null ? "—" : `${threat.timeToCollisionS.toFixed(2)}s`}</td><td>{threat.sector}</td><td className={threat.severity === "suppressed" ? "text-slate-500" : "text-amber-200"}>{threat.severity}</td></tr>
                  )) : <tr><td colSpan={6} className="border-t border-white/5 py-5 text-center text-slate-600">No admitted traffic threats in this frame</td></tr>}
                </tbody>
              </table>
            </div>
          </article>
        </div>

        <div className="space-y-3">
          <article className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
            <div className="flex items-center justify-between"><h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Fixture oracle</h2>{complete ? <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${oraclePassed ? "bg-emerald-400/15 text-emerald-200" : "bg-red-400/15 text-red-200"}`} data-testid="fixture-verdict">{oraclePassed ? "PASS" : "FAIL"}</span> : <span className="text-[10px] text-slate-600">not evaluated</span>}</div>
            <div className="mt-3 grid grid-cols-2 gap-2"><Metric label="Expected sectors" value={fixture.expected.finalActiveSectors.join(", ") || "none"} /><Metric label="Actual sectors" value={session.state.activeCues.map((cue) => cue.sector).join(", ") || "none"} /><Metric label="Expected blank" value={fixture.expected.finalBlankReason} /><Metric label="Actual blank" value={session.state.blankReason} /></div>
          </article>

          <article className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Causal receipt</h2>
            {latestReceipt ? <div className="mt-2 space-y-2 font-mono text-[10px] text-slate-400"><div className="break-all rounded bg-black/30 p-2 text-cyan-200">{latestReceipt.causalHash}</div><div>receipt: {latestReceipt.receiptId}</div><div>pose: {latestReceipt.poseRef ?? "none"}</div><div>cues: {latestReceipt.cueIds.join(", ") || "none"}</div><div>identity: {fixtureIdentityHash(latestReceipt)}</div></div> : <div className="mt-3 rounded border border-dashed border-white/10 p-4 text-center text-xs text-slate-600">Step or run the fixture to generate evidence.</div>}
          </article>

          <article className="rounded-lg border border-violet-300/15 bg-slate-950/70 p-3" data-testid="codex-reasoning-preview">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-200">Codex reasoning preview</h2>
              <div className="flex gap-1"><span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] uppercase text-slate-400">offline</span><span className="rounded bg-violet-400/10 px-1.5 py-0.5 text-[9px] uppercase text-violet-200">advisory only</span></div>
            </div>
            <div className="mt-2 grid gap-2 text-[10px] sm:grid-cols-2">
              <div className="rounded border border-white/5 bg-black/20 p-2">
                <div className="uppercase tracking-[0.14em] text-slate-500">Bound evidence</div>
                <div className="mt-1 break-all font-mono text-cyan-200">{latestReceipt?.causalHash ?? "No replay receipt selected"}</div>
              </div>
              <div className="rounded border border-white/5 bg-black/20 p-2">
                <div className="uppercase tracking-[0.14em] text-slate-500">Public advisory output</div>
                <div className="mt-1 text-slate-400">No model turn. A later stage may explain cue admission, compare runs, or propose a bounded next fixture.</div>
              </div>
            </div>
            <div className="mt-2 rounded bg-violet-400/[0.05] px-2 py-1.5 font-mono text-[9px] text-violet-200/70">material event → bounded digest → Runtime Codex → advisory candidate → Helix eligibility</div>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-500">Codex never writes HUD pixels, extends cue TTL, clears the watchdog, or blocks the local reflex controller.</p>
          </article>

          <article className="rounded-lg border border-amber-300/15 bg-amber-400/[0.04] p-3 text-[11px] leading-relaxed text-slate-400">
            <div className="flex gap-2"><AlertTriangle className="mt-0.5 shrink-0 text-amber-300" size={15} /><p>This panel is an engineering replay surface, not a certified warning device. FiveM, Minecraft, hardware IO, projector output, and network reasoning remain intentionally disconnected.</p></div>
          </article>

          <button type="button" onClick={() => { setSession((current) => ({ ...current, state: { ...current.state, activeCues: [], blankReason: "emergency_stop" } })); setRegistryBlankRequest((value) => value + 1); setPlaying(false); }} className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-red-200 hover:bg-red-500/20" aria-label="Emergency blank HUD"><CircleStop size={16} />Emergency blank</button>
        </div>
      </main>
      <div className="border-t border-white/10 p-3">
        <div className="mb-3"><SurfaceRegistryStatus binding={surfaceBinding} emergencyBlankRequest={registryBlankRequest} /></div>
        <VisualSequenceInspector
          hudElement={hudElement}
          hudReceipt={hudSurfaceReceipt}
          hudIdentity={{
            sourceId: surfaceBinding.sourceId,
            producerEpoch: surfaceBinding.producerEpoch,
            profileId: "pending-authenticated-profile",
            runId: surfaceBinding.runId,
            threadId: "motorcycle-hud-lab",
          }}
        />
      </div>
    </section>
  );
}
