import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localMusicRecipeSchema } from "@shared/noisegen-local-provider";
import type { MusicStudioCommand, MusicStudioState } from "@shared/local-music/studio";
import StemDaw from "./StemDaw";
import { listKnowledgeFiles, type KnowledgeFileRecord } from "@/lib/agi/knowledge-store";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, readCachedAccountProfileIdentity } from "@/lib/workstation/accountCapabilityPolicy";
import { captureAccountOperationScope } from "@/lib/workstation/accountOperationScope";

type Bridge = { localMusic?: (command: MusicStudioCommand) => Promise<{ ok: boolean; result?: any; error?: string }> };
const bridge = () => (window as unknown as { casimirDesktop?: Bridge }).casimirDesktop;
const readableError = (error: string) => ({
  sign_in_required: "Sign into CasimirBot first using Account, sign-in and workstation below.",
  mcp_tunnel_active_account_session_required: "Sign into CasimirBot first using Account, sign-in and workstation below.",
  resource_unavailable: "There is not enough free memory for this model. Close other music models or large apps, then try again.",
  separator_unconfigured: "Configure the separate Demucs Python environment and local weights, or import existing bass/drum stems.",
  runtime_identity_changed: "The selected runtime differs from the supported reference. Reconnect the compatible installation; unknown model code will not run.",
  storage_must_be_outside_runtime: "Choose an output location outside the Music-AI installation, such as the root of J:.",
} as Record<string, string>)[error] ?? error;
const prompts = {
  "Dark glass": "Spacious dark ambient pads, evolving glassy shimmer, airy granular clouds, slow filter movement and long reverb tails. Sparse sustained harmonic washes.",
  "Warm haze": "Warm hazy analog pads, softly detuned sustained chords, tape texture and slow breathing movement.",
  "Air and dust": "Airy noise-based ambience, delicate granular dust, filtered breathy swells, minimal pitched content.",
};
export function LocalMusicStudio({ onLegacy }: { onLegacy: () => void }) {
  const [revision, setRevision] = useState(() => readCachedAccountProfileIdentity().revision);
  useEffect(() => {
    const update = () => setRevision(readCachedAccountProfileIdentity().revision);
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, update);
    update();
    return () => window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, update);
  }, []);
  return <LocalMusicStudioSession key={revision} onLegacy={onLegacy} />;
}

function LocalMusicStudioSession({ onLegacy }: { onLegacy: () => void }) {
  const mounted = useRef(true);
  const accountScope = useRef(captureAccountOperationScope());
  const current = useCallback(() => mounted.current && accountScope.current(), []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const scoped = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    if (!current()) throw Error("music_account_scope_changed");
    const value = await operation();
    if (!current()) throw Error("music_account_scope_changed");
    return value;
  }, [current]);
  const [state, setState] = useState<MusicStudioState>();
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState(prompts["Dark glass"]), [noMelody, setNoMelody] = useState(true);
  const [variation, setVariation] = useState(.35), [baseSeed, setBaseSeed] = useState(161803);
  const [variationSeed, setVariationSeed] = useState(424242), [seconds, setSeconds] = useState(15);
  const [start, setStart] = useState(0), [level, setLevel] = useState(-9), [cutoff, setCutoff] = useState(300);
  const [bass, setBass] = useState(""), [drums, setDrums] = useState("");
  const [takeId, setTakeId] = useState(""); const [urls, setUrls] = useState<Record<string, string>>({});
  const [bindingId, setBindingId] = useState(""), [bindingEpoch, setBindingEpoch] = useState(1);
  const [library, setLibrary] = useState<KnowledgeFileRecord[]>([]), [libraryId, setLibraryId] = useState("");
  const [libraryRole, setLibraryRole] = useState<"source" | "bass" | "drums">("source");
  const call = useCallback(async (command: MusicStudioCommand) => {
    const api = bridge()?.localMusic;
    if (!api) throw Error("Open this panel in the CasimirBot desktop app to use local models.");
    const response = await scoped(() => api(command));
    if (!response.ok) throw Error(readableError(response.error ?? "native_audio_unavailable"));
    return response.result;
  }, [scoped]);
  const refreshSequence = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    const next = await call({ type: "state" });
    if (sequence === refreshSequence.current) setState(next);
    return next as MusicStudioState;
  }, [call]);
  const act = async (command: MusicStudioCommand) => {
    setError(""); setBusy(true);
    try { const result = await call(command); await refresh(); return result; }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  useEffect(() => { let live = true; const update = () => refresh().catch(e => { if (live) setError(e.message); });
    void update(); const timer = setInterval(() => { if (live) void update(); }, 2500);
    return () => { live = false; clearInterval(timer); }; }, [refresh]);
  useEffect(() => {
    if (!state) return;
    if (!state.assets.some(a => a.id === bass)) setBass(state.assets.find(a => a.role === "bass")?.id ?? "");
    if (!state.assets.some(a => a.id === drums)) setDrums(state.assets.find(a => a.role === "drums")?.id ?? "");
  }, [state?.assets.map(a => a.id).join(",")]);
  const mixes = state?.assets.filter(a => a.role === "mix") ?? [];
  const selectedMix = mixes.find(a => a.takeId === takeId) ?? mixes.at(-1);
  const selectedTake = selectedMix?.takeId;
  const layers = state?.assets.filter(a => selectedTake ? a.takeId === selectedTake &&
    ["bass", "drums", "synth"].includes(a.role) : [bass, drums].includes(a.id)) ?? [];
  const previewAssets = [...layers, ...(selectedMix ? [selectedMix] : [])];
  const previewKey = previewAssets.map(a => a.id).join(",");
  useEffect(() => { let active = true; const created: string[] = [];
    void Promise.all(previewAssets.map(async a => { const result = await call({ type: "asset", asset_id: a.id });
      const bytes = Uint8Array.from(atob(result.base64), c => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: result.mime })); created.push(url);
      return [a.id, url] as const;
    })).then(entries => { if (active) setUrls(Object.fromEntries(entries)); else created.forEach(URL.revokeObjectURL); })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; created.forEach(URL.revokeObjectURL); }; }, [previewKey, call]);
  const recipe = useMemo(() => {
    if (!state || !bass || !drums) return null;
    return localMusicRecipeSchema.safeParse({ schema: "casimirbot.local_music_recipe.v1",
      project_id: state.projectId, runtime_ref: state.runtimeRef, model_ref: state.modelRef,
      backing: { bass_asset_id: bass, drums_asset_id: drums }, clip: { start_seconds: start, duration_seconds: seconds },
      synthesis: { provider_id: "ace-step-1.5-base", prompt, no_lead_melody: noMelody,
        base_seed: baseSeed, variation_seed: variationSeed, variation },
      mix: { synth_level_db: level, synth_highpass_hz: cutoff },
      output: { sample_rate: 48000, channels: 2, format: "wav" } });
  }, [state?.projectId, state?.runtimeRef, state?.modelRef, bass, drums, start, seconds, prompt, noMelody, baseSeed, variationSeed, variation, level, cutoff]);
  const request = (operation: string, extra: object = {}) => ({ schema: "casimirbot.local_music_request.v1",
    request_id: `request:${crypto.randomUUID()}`, project_id: state!.projectId,
    grant_id: state!.grant!.id, operation, ...extra });
  const running = state?.jobs.some(j => j.status === "running");
  const disabled = busy || running || !state?.grant;
  const number = (label: string, value: number, set: (n: number) => void, min: number, max: number, step=1) =>
    <label className="flex flex-col gap-1 text-sm">{label}<Input aria-label={label} type="number"
      min={min} max={max} step={step} value={value} onChange={e => set(Number(e.target.value))} /></label>;
  return <div className="mx-auto max-w-6xl space-y-5 p-5 text-slate-100">
    <div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-semibold">Noise Gen · Local music studio</h1>
      <p className="text-sm text-slate-400">Preserve bass and drums. Generate a new synth atmosphere with your local model.</p></div>
      <Button variant="outline" onClick={onLegacy}>Legacy library</Button></div>
    <a className="inline-block text-sm text-sky-300 underline" href="/desktop?panels=account-session&focus=account-session">Account, sign-in and workstation</a>
    {error && <div role="alert" className="rounded border border-amber-600 p-3">{error}</div>}
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy || running} onClick={() => act({ type: "configure" })}>{state?.configured ? "Reconnect runtime" : "Connect local ACE-Step"}</Button>
      <Button disabled={busy || running || !state?.configured} onClick={() => act({ type: "configure_separator" })}>Configure local Demucs</Button>
      <Button disabled={busy || running} onClick={() => act({ type: "new_project", name: "Local music " + new Date().toLocaleDateString() })}>New project</Button>
      <Button variant="destructive" onClick={() => act({ type: "revoke" })}>Stop / revoke</Button>
    </div>
    <p className="text-xs text-slate-400">Runtime and weights stay outside CasimirBot. Choose the Music-AI folder, ffmpeg.exe, then a separate output location. Use one music model app at a time.</p>
    {state?.projects.length ? <label>Saved project<select aria-label="Saved project" className="ml-3 rounded bg-slate-800 p-2" value={state.projectId}
      disabled={busy || running} onChange={e => act({ type: "open_project", project_id: e.target.value })}>
      {state.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label> : null}
    <section className="space-y-3 rounded-lg border border-slate-700 p-4"><h2 className="font-medium">1 · Local inputs</h2>
      <div className="flex flex-wrap gap-2">{(["source", "bass", "drums"] as const).map(role =>
        <Button key={role} disabled={busy || running || !state?.configured} onClick={() => act({ type: "import", role })}>Import {role === "source" ? "mixed sample" : role + " stem"}</Button>)}</div>
      <details><summary>Import audio from the existing browser library</summary>
        <Button variant="outline" onClick={async () => {
          try { setLibrary((await scoped(listKnowledgeFiles)).filter(f => f.mime.startsWith("audio/"))); }
          catch (e: any) { if (current()) setError(e.message); }
        }}>Read local library</Button>
        <select aria-label="Library audio" className="m-2 rounded bg-slate-800 p-2" value={libraryId} onChange={e => setLibraryId(e.target.value)}>
          <option value="">Select an audio file</option>{library.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
        <select aria-label="Library import role" className="rounded bg-slate-800 p-2" value={libraryRole} onChange={e => setLibraryRole(e.target.value as any)}>
          <option value="source">Mixed source</option><option value="bass">Bass stem</option><option value="drums">Drum stem</option></select>
        <Button disabled={busy || running || !state?.configured || !libraryId} onClick={async () => {
          try { const file = library.find(f => f.id === libraryId)!;
            if (file.data.size > 24*1024*1024) throw Error("Browser-library import is limited to 24 MB. Use the native file picker for larger audio.");
            const reader = new FileReader(); const data = await new Promise<string>((resolve, reject) => {
              reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = reject;
              reader.readAsDataURL(file.data); });
            await act({ type: "import_bytes", role: libraryRole, name: file.name, base64: data });
          } catch (e: any) { setError(e.message); }
        }}>Import selected audio locally</Button>
        <p className="text-xs text-slate-400">Copies only the file you select into the native project. Nothing is uploaded.</p>
      </details>
      <div className="grid gap-3 sm:grid-cols-2">{(["bass", "drums"] as const).map(role => <label key={role}>{role === "bass" ? "Preserved bass" : "Preserved drums"}
        <select aria-label={role} className="block w-full rounded bg-slate-800 p-2" value={role === "bass" ? bass : drums}
          onChange={e => (role === "bass" ? setBass : setDrums)(e.target.value)}><option value="">Choose stem</option>
          {state?.assets.filter(a => a.role === role).map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>)}</div>
      <div className="grid gap-3 sm:grid-cols-2">{number("Start (seconds)", start, setStart, 0, 3600)}{number("Clip length (seconds)", seconds, setSeconds, 1, 30)}</div>
      <Button disabled={disabled || !state?.assets.some(a => a.role === "source")} onClick={() => act({ type: "submit",
        request: request("separate", { source_asset_id: state!.assets.find(a => a.role === "source")!.id,
          clip: { start_seconds: start, duration_seconds: seconds } }) as any })}>Separate selected mixed sample locally</Button>
      <p className="text-xs text-slate-400">Imported stems must be aligned. Separation can leave melody bleed. Importing inputs revokes the previous session.</p>
    </section>
    <section className="space-y-3 rounded-lg border border-slate-700 p-4"><h2 className="font-medium">2 · Authorize a bounded session</h2>
      <div className="flex flex-wrap gap-2"><Button disabled={busy || !state?.assets.length} onClick={() => act({ type: "grant" })}>Allow manual controls</Button>
        <Button variant="outline" onClick={async () => { try { const body = await scoped(async () => {
          const r = await fetch("/api/account/session/agent-connections/reasoning-bindings/current");
          if (!r.ok) throw Error("Pair this Codex chat in Agent Access first.");
          return r.json();
        });
          const b = body.binding; if (!b || b.status !== "active") throw Error("Pair this Codex chat in Agent Access first.");
          setBindingId(b.reasoning_binding_id); setBindingEpoch(b.binding_epoch); } catch (e: any) { setError(e.message); } }}>Use current paired chat</Button></div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Reasoning binding ID<Input value={bindingId} onChange={e => setBindingId(e.target.value)} /></label>
        {number("Binding epoch", bindingEpoch, setBindingEpoch, 1, 100000)}</div>
      <Button disabled={busy || !bindingId || !state?.assets.length} onClick={() => act({ type: "grant", binding_id: bindingId, binding_epoch: bindingEpoch })}>Allow this paired Codex chat</Button>
      <p className="text-sm">{state?.grant ? `${state.grant.remaining} generation attempts remaining · expires ${new Date(state.grant.expiresAt).toLocaleTimeString()}` : "No active session. Approval happens in a native dialog."}</p>
    </section>
    <section className="space-y-3 rounded-lg border border-slate-700 p-4"><h2 className="font-medium">3 · Synth texture and variation</h2>
      <select aria-label="Texture preset" className="rounded bg-slate-800 p-2" onChange={e => setPrompt(prompts[e.target.value as keyof typeof prompts])}>
        {Object.keys(prompts).map(p => <option key={p}>{p}</option>)}</select>
      <textarea aria-label="Texture description" className="min-h-24 w-full rounded bg-slate-800 p-3" value={prompt} onChange={e => setPrompt(e.target.value)} />
      <label className="flex gap-2"><input type="checkbox" checked={noMelody} onChange={e => setNoMelody(e.target.checked)} />Ask for atmosphere without a lead melody</label>
      <label className="block">Variation: {variation.toFixed(2)}<input aria-label="Variation" className="block w-full" type="range" min="0" max="1" step=".05" value={variation} onChange={e => setVariation(Number(e.target.value))} /></label>
      <p className="text-xs text-slate-400">0 repeats base starting noise; 1 uses variation-seed noise fully. This changes only synth, not a percentage of notes. Keep both seeds fixed to compare amounts.</p>
      <div className="grid gap-3 sm:grid-cols-2">{number("Base seed", baseSeed, setBaseSeed, 0, 4294967295)}{number("Variation seed", variationSeed, setVariationSeed, 0, 4294967295)}</div>
      <Button variant="outline" onClick={() => setVariationSeed(crypto.getRandomValues(new Uint32Array(1))[0])}>Pick another variation seed</Button>
      <div className="grid gap-3 sm:grid-cols-2">{number("Synth level (dB)", level, setLevel, -30, 0)}{number("Synth low-cut (Hz)", cutoff, setCutoff, 80, 1500, 10)}</div>
      <div className="flex gap-2"><Button disabled={disabled || !recipe?.success} onClick={() => recipe?.success && act({ type: "submit", request: request("generate_synth", { recipe: recipe.data }) as any })}>Generate synth + mix</Button>
        <Button disabled={disabled || !selectedMix} onClick={() => act({ type: "submit", request: request("mix", {
          take_id: selectedMix!.sourceTakeId ?? selectedMix!.takeId,
          mix: { synth_level_db: level, synth_highpass_hz: cutoff } }) as any })}>Update mix only</Button></div>
      <p className="text-xs text-slate-400">The first render loads the model and can take several minutes. Later renders reuse it.</p>
      {state?.jobs.slice(-3).map(j => <p key={j.id} className="text-sm" role="status">{j.status}{j.error ? `: ${readableError(j.error)}` : ""}</p>)}
    </section>
    {mixes.length > 0 && <section className="space-y-3"><h2 className="font-medium">4 · Compare takes and export</h2>
      <select aria-label="Take" className="rounded bg-slate-800 p-2" value={selectedMix?.takeId} onChange={e => setTakeId(e.target.value)}>
        {mixes.map(a => <option key={a.id} value={a.takeId}>{a.label}</option>)}</select>
      {selectedMix && urls[selectedMix.id] && <audio aria-label="Finished mix" controls src={urls[selectedMix.id]} />}
      <Button onClick={() => selectedMix && act({ type: "export", asset_id: selectedMix.id })}>Export mix WAV</Button>
      {layers.filter(a => a.role === "synth").map(a => <Button key={a.id} variant="outline" onClick={() => act({ type: "export", asset_id: a.id })}>Export synth WAV</Button>)}
    </section>}
    <StemDaw track={{ id: selectedTake ?? state?.projectId ?? "local-music", name: state?.projectName ?? "Local music",
      durationSeconds: selectedMix?.seconds ?? seconds, stems: layers.filter(a => urls[a.id]).map(a => ({ id: a.id,
        label: a.role === "synth" ? "Generated synth" : `Preserved ${a.role}`, url: urls[a.id] })) }} />
    {state?.grant && <details><summary>Session connection for paired Codex</summary><textarea aria-label="Codex recipe" readOnly className="min-h-64 w-full rounded bg-slate-900 p-3 text-xs"
      value={JSON.stringify({ capability_id: "noisegen.local", mode: "act", arguments: {
        reasoning_binding_id: bindingId, binding_epoch: bindingEpoch,
        request: request("inspect") } }, null, 2)} /></details>}
    <p className="text-xs text-slate-400">Stop / revoke ends the session and unloads the worker. Closing this panel alone does not release model memory. Audio is kept local.</p>
  </div>;
}
