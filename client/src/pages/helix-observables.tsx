import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_HCE_CONFIG,
  type HceConfigResponse,
  type HceResolvedConfig,
  type HceConfigPayload,
  type HcePeak,
} from "@shared/hce-types";
import BranchScope from "../components/BranchScope";
import ObservablesPanel from "../components/ObservablesPanel";
import { createHceClient } from "../lib/hce-client";
import {
  dwellTimes,
  fitLorentzianAmps,
  mutualInformationBits,
  toCSV,
  welchPSD,
} from "../lib/hce-metrics";

const defaultPeaks: HcePeak[] = [
  { omega: 3.2, gamma: 0.18, alpha: 1.2 },
  { omega: 6.5, gamma: 0.2, alpha: 0.8 },
  { omega: 9.8, gamma: 0.3, alpha: 0.6 },
];

type BranchPair = {
  predicted: number;
  actual: number;
  weirdness: number;
  rc: number;
  timestamp: number;
};

const latentDim = DEFAULT_HCE_CONFIG.latentDim;
const AUDIO_MIN_HZ = 20;
const AUDIO_MAX_HZ = 20_000;
const MAX_BRANCH_SAMPLES = 2_048;
const RECORD_SECONDS = 10;
const HELIX_PACKET_STORAGE_KEY = "helix:lastPacket";

const persistHelixPacket = (
  config: HceResolvedConfig,
  peaks: HcePeak[],
  extras?: { branch?: number; weirdness?: number },
) => {
  if (typeof window === "undefined") return;
  try {
    const packet = {
      seed: config.seed,
      rc: config.rc,
      tau: config.tau,
      lambda: config.lambda,
      K: config.K,
      peaks,
      weirdness: typeof extras?.weirdness === "number" ? extras.weirdness : undefined,
      branch: typeof extras?.branch === "number" ? extras.branch : undefined,
    };
    window.localStorage.setItem(HELIX_PACKET_STORAGE_KEY, JSON.stringify(packet));
  } catch {
    // ignore storage errors (e.g., private mode)
  }
};


const toAudioHz = (omega: number) =>
  Math.max(AUDIO_MIN_HZ, Math.min(AUDIO_MAX_HZ, omega * 180 + 80));

const gammaFromPeak = (peak: HcePeak) => {
  const freq = toAudioHz(peak.omega);
  const q = 1 / (peak.gamma + 0.01);
  return Math.max(1, freq / Math.max(q, 0.1));
};

const downsampleBuffer = (
  input: Float32Array,
  sourceRate: number,
  targetRate: number,
) => {
  if (!Number.isFinite(sourceRate) || sourceRate <= 0 || targetRate <= 0) {
    return { data: input, rate: sourceRate };
  }
  if (targetRate >= sourceRate) {
    return { data: input, rate: sourceRate };
  }
  const ratio = sourceRate / targetRate;
  const length = Math.floor(input.length / ratio);
  if (!Number.isFinite(length) || length <= 0) {
    return { data: input, rate: sourceRate };
  }
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const index = Math.min(input.length - 1, Math.floor(i * ratio));
    output[i] = input[index];
  }
  return { data: output, rate: targetRate };
};

const HelixObservablesPage = () => {
  const hceClient = useMemo(() => createHceClient(), []);
  const [config, setConfig] = useState({
    rc: DEFAULT_HCE_CONFIG.rc,
    tau: DEFAULT_HCE_CONFIG.tau,
    beta: DEFAULT_HCE_CONFIG.beta,
    lambda: DEFAULT_HCE_CONFIG.lambda,
    dt: DEFAULT_HCE_CONFIG.dt,
    K: DEFAULT_HCE_CONFIG.K,
  });
  const [peaks, setPeaks] = useState<HcePeak[]>(defaultPeaks);
  const [weirdness, setWeirdness] = useState(0.2);
  const [prompt, setPrompt] = useState(
    "Describe a shimmering lattice of vacuum fluctuations harmonizing with resonant light.",
  );
  const [run, setRun] = useState<HceConfigResponse | null>(null);
  const [branchCenters, setBranchCenters] = useState<number[][]>([]);
  const [psi, setPsi] = useState<number[]>();
  const [energies, setEnergies] = useState<number[]>([]);
  const [suggestedBranch, setSuggestedBranch] = useState<number | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<number | null>(null);
  const [summary, setSummary] = useState<string>("");
  const [time, setTime] = useState(0);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branchHistory, setBranchHistory] = useState<number[]>([]);
  const [branchPairs, setBranchPairs] = useState<BranchPair[]>([]);
  const [miSeries, setMiSeries] = useState<Array<{ T: number; bits: number }>>([]);
  const [dwellSeries, setDwellSeries] = useState<number[]>([]);
  const [psdResult, setPsdResult] = useState<{
    freqs: Float32Array;
    psd: Float32Array;
    amps: number[];
  } | null>(null);
  const [recording, setRecording] = useState(false);
  const [pcmData, setPcmData] = useState<{
    left: Float32Array;
    right: Float32Array;
    sampleRate: number;
  } | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareInfo, setShareInfo] = useState<string | null>(null);
  const subscriptionRef = useRef<ReturnType<typeof hceClient.stream> | null>(
    null,
  );

  const audioCtxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const shareLoadedRef = useRef(false);

  const dwellStats = useMemo(() => {
    if (!dwellSeries.length) return null;
    const total = dwellSeries.reduce((acc, value) => acc + value, 0);
    const mean = total / dwellSeries.length;
    const max = Math.max(...dwellSeries);
    const min = Math.min(...dwellSeries);
    return {
      meanMs: mean * 1_000,
      minMs: min * 1_000,
      maxMs: max * 1_000,
    };
  }, [dwellSeries]);

  const psdAmps = useMemo(() => {
    if (!psdResult) return [];
    return peaks.map((peak, idx) => ({
      freqHz: toAudioHz(peak.omega),
      amp: psdResult.amps[idx] ?? 0,
    }));
  }, [peaks, psdResult]);

  const ensureAudioNode = useCallback(async () => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      await ctx.audioWorklet.addModule(
        new URL("../audio/HelixNoise.worklet.ts", import.meta.url),
      );
      const node = new AudioWorkletNode(ctx, "helix-noise", {
        outputChannelCount: [2],
      });
      node.connect(ctx.destination);
       node.port.onmessage = (event) => {
        const message = event.data;
        if (message && message.type === "record-complete") {
          try {
            const left =
              message.left instanceof Float32Array
                ? (message.left as Float32Array)
                : new Float32Array(message.left);
            const right =
              message.right instanceof Float32Array
                ? (message.right as Float32Array)
                : new Float32Array(message.right);
            const sampleRate =
              typeof message.sampleRate === "number" && Number.isFinite(message.sampleRate)
                ? message.sampleRate
                : ctx.sampleRate;
            setRecording(false);
            setPcmData({ left, right, sampleRate });
          } catch (err) {
            console.warn("[helix-noise] failed to parse record buffer", err);
            setRecording(false);
          }
        }
      };
      nodeRef.current = node;
    }
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === "suspended") {
      await ctx.resume();
    }
    return nodeRef.current;
  }, []);

  const configureRun = useCallback(async () => {
    setStreaming(true);
    try {
      setError(null);
      subscriptionRef.current?.close();
      const response = await hceClient.configure({
        rc: config.rc,
        tau: config.tau,
        beta: config.beta,
        lambda: config.lambda,
        K: config.K,
        dt: config.dt,
        latentDim,
        peaks,
      });
      setRun(response);
      setBranchCenters(response.branchCenters);
      setPsi(response.initialState);
      setEnergies(new Array(response.config.K).fill(0));
      setSuggestedBranch(null);
      setSelectedBranch(null);
      setSummary("");
      setTime(0);
      setBranchHistory([]);
      setBranchPairs([]);
      setMiSeries([]);
      setDwellSeries([]);
      setPsdResult(null);
      setPcmData(null);
      setShareInfo(null);
      persistHelixPacket(response.config, peaks);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setStreaming(false);
    }
  }, [config, hceClient, peaks]);

  useEffect(() => {
    if (!run) return;
    subscriptionRef.current?.close();
    const subscription = hceClient.stream(run.runId, (event) => {
      setPsi(event.psi);
      setEnergies(event.energies);
      setSuggestedBranch(event.suggestedBranch);
      setTime(event.t);
      setBranchHistory((prev) => {
        const next =
          prev.length >= MAX_BRANCH_SAMPLES
            ? [...prev.slice(prev.length - MAX_BRANCH_SAMPLES + 1), event.suggestedBranch]
            : [...prev, event.suggestedBranch];
        return next;
      });
    });
    subscriptionRef.current = subscription;
    setStreaming(false);
    return () => {
      subscription.close();
    };
  }, [hceClient, run]);

  useEffect(() => {
    if (!branchHistory.length) {
      setDwellSeries([]);
      return;
    }
    const dtSec = run?.config.dt ?? config.dt;
    setDwellSeries(dwellTimes(branchHistory, dtSec));
  }, [branchHistory, run?.config.dt, config.dt]);

  useEffect(
    () => () => {
      subscriptionRef.current?.close();
      subscriptionRef.current = null;
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    },
    [],
  );

  useEffect(() => {
    if (!branchPairs.length || !run) {
      setMiSeries([]);
      return;
    }
    const groups = new Map<number, { xs: number[]; ys: number[] }>();
    for (const entry of branchPairs) {
      if (entry.predicted < 0 || entry.actual < 0) continue;
      const key = Number(entry.weirdness.toFixed(2));
      const bucket = groups.get(key) ?? { xs: [] as number[], ys: [] as number[] };
      bucket.xs.push(entry.predicted);
      bucket.ys.push(entry.actual);
      groups.set(key, bucket);
    }
    const series = Array.from(groups.entries())
      .map(([T, bucket]) => ({
        T,
        bits:
          bucket.xs.length > 0
            ? mutualInformationBits(bucket.xs, bucket.ys, run.config.K)
            : 0,
      }))
      .filter((entry) => Number.isFinite(entry.bits))
      .sort((a, b) => a.T - b.T);
    setMiSeries(series);
  }, [branchPairs, run]);

  useEffect(() => {
    if (!pcmData) return;
    if (pcmData.left.length === 0) {
      setPsdResult(null);
      return;
    }
    const targetRate = 8_000;
    const { data, rate } = downsampleBuffer(pcmData.left, pcmData.sampleRate, targetRate);
    if (!Number.isFinite(rate) || rate <= 0 || data.length === 0) {
      setPsdResult(null);
      return;
    }
    const { freqs, psd } = welchPSD(data, rate, 1.0, 0.5);
    const amps = peaks.length
      ? fitLorentzianAmps(
          freqs,
          psd,
          peaks.map((peak) => toAudioHz(peak.omega)),
          peaks.map((peak) => gammaFromPeak(peak)),
        )
      : [];
    setPsdResult({ freqs, psd, amps });
  }, [pcmData, peaks]);

  useEffect(() => {
    if (shareLoadedRef.current) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get("runId");
    shareLoadedRef.current = true;
    if (!shareId) return;
    (async () => {
      try {
        setStreaming(true);
        setShareInfo(null);
        const response = await fetch(`/api/hce/share/${shareId}`);
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Shared run not found");
        }
        const payload = await response.json();
        const shareParams = (payload as { params?: any }).params;
        if (!shareParams || !shareParams.config) {
          throw new Error("Share payload missing configuration");
        }
        const sharedConfig = shareParams.config;
        const sharedPeaks: HcePeak[] = Array.isArray(shareParams.peaks) ? shareParams.peaks : defaultPeaks;
        const configurePayload: HceConfigPayload = {
          seed: sharedConfig.seed,
          rc: sharedConfig.rc ?? DEFAULT_HCE_CONFIG.rc,
          tau: sharedConfig.tau ?? DEFAULT_HCE_CONFIG.tau,
          beta: sharedConfig.beta ?? DEFAULT_HCE_CONFIG.beta,
          lambda: sharedConfig.lambda ?? DEFAULT_HCE_CONFIG.lambda,
          K: sharedConfig.K ?? DEFAULT_HCE_CONFIG.K,
          latentDim: sharedConfig.latentDim ?? DEFAULT_HCE_CONFIG.latentDim,
          dt: sharedConfig.dt ?? DEFAULT_HCE_CONFIG.dt,
          peaks: sharedPeaks,
        };
        setConfig({
          rc: configurePayload.rc,
          tau: configurePayload.tau,
          beta: configurePayload.beta,
          lambda: configurePayload.lambda ?? DEFAULT_HCE_CONFIG.lambda,
          dt: configurePayload.dt ?? DEFAULT_HCE_CONFIG.dt,
          K: configurePayload.K,
        });
        setPeaks(sharedPeaks);
        if (typeof shareParams.weirdness === "number") {
          setWeirdness(shareParams.weirdness);
        }
        if (typeof shareParams.prompt === "string") {
          setPrompt(shareParams.prompt);
        }
        subscriptionRef.current?.close();
        const configured = await hceClient.configure(configurePayload);
        setRun(configured);
        setBranchCenters(configured.branchCenters);
        setPsi(configured.initialState);
        setEnergies(new Array(configured.config.K).fill(0));
        setSuggestedBranch(null);
        setSelectedBranch(null);
        setSummary("");
        setTime(0);
        setBranchHistory([]);
        setBranchPairs([]);
        setMiSeries([]);
        setDwellSeries([]);
        setPsdResult(null);
        setPcmData(null);
        persistHelixPacket(configured.config, sharedPeaks, { weirdness });
        setShareInfo("Loaded shared run.");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      } finally {
        setStreaming(false);
      }
    })();
  }, [hceClient]);

  const handleMeasure = useCallback(async () => {
    if (!run) return;
    try {
      setError(null);
      const node = await ensureAudioNode();
      if (!node) return;
      const result = await hceClient.measure({
        runId: run.runId,
        text: prompt,
        weirdness,
        lambda: config.lambda,
      });
      setSelectedBranch(result.branch);
      setSummary(result.summary);
      setEnergies(result.energies);
      node.port.postMessage(result.audioParams);
      persistHelixPacket(run.config, peaks, { branch: result.branch, weirdness });
      if (suggestedBranch !== null) {
        setBranchPairs((prev) => {
          const next = [
            ...prev,
            {
              predicted: suggestedBranch,
              actual: result.branch,
              weirdness,
              rc: config.rc,
              timestamp:
                typeof performance !== "undefined" && performance.now
                  ? performance.now()
                  : Date.now(),
            },
          ];
          if (next.length > 256) {
            next.splice(0, next.length - 256);
          }
          return next;
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    }
  }, [
    config.lambda,
    config.rc,
    ensureAudioNode,
    hceClient,
    peaks,
    prompt,
    run,
    suggestedBranch,
    weirdness,
  ]);

  const handleShare = useCallback(async () => {
    if (!run) return;
    try {
      setSharing(true);
      setShareInfo(null);
      setError(null);
      const response = await fetch("/api/hce/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          params: {
            config: run.config,
            peaks,
            weirdness,
            prompt,
          },
        }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to create share link");
      }
      const payload = (await response.json()) as { runId?: string };
      if (payload?.runId && typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("runId", payload.runId);
        window.history.replaceState(null, "", url.toString());
        setShareInfo("Permalink updated in the URL.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setSharing(false);
    }
  }, [peaks, prompt, run, setError, setShareInfo, setSharing, weirdness]);

  const handleRecordPcm = useCallback(async () => {
    const node = await ensureAudioNode();
    if (!node || recording) return;
    const ctx = audioCtxRef.current;
    const sampleRate = ctx?.sampleRate ?? 48_000;
    const frames = Math.floor(sampleRate * RECORD_SECONDS);
    if (!Number.isFinite(frames) || frames <= 0) return;
    setRecording(true);
    setPsdResult(null);
    setPcmData(null);
      setShareInfo(null);
    node.port.postMessage({ type: "record", frames });
  }, [ensureAudioNode, recording]);

  const handleExportCsv = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!miSeries.length && !dwellSeries.length) return;
    const rows: (string | number)[][] = [["series", "label", "value"]];
    for (const entry of miSeries) {
      rows.push([
        "mi_bits",
        Number(entry.T.toFixed(3)),
        Number(entry.bits.toFixed(5)),
      ]);
    }
    dwellSeries.forEach((dur, idx) => {
      rows.push(["dwell_ms", idx, Number((dur * 1000).toFixed(2))]);
    });
    const csv = toCSV(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "hce-evidence.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }, [dwellSeries, miSeries]);

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6 text-slate-50">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Helix Collapse Observables</h1>
        <p className="max-w-3xl text-sm text-slate-300">
          Evolve a single stochastic latent field and observe how language and
          audio collapse to the same branch. Adjust the colored-noise spectrum,
          correlation length, and weirdness to explore the shared outcome space.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        <ObservablesPanel
          rc={config.rc}
          tau={config.tau}
          beta={config.beta}
          lambda={config.lambda}
          dt={config.dt}
          K={config.K}
          peaks={peaks}
          weirdness={weirdness}
          disabled={streaming}
          onConfigChange={(patch) => setConfig((prev) => ({ ...prev, ...patch }))}
          onPeaksChange={setPeaks}
          onWeirdnessChange={setWeirdness}
        />
        <div className="space-y-4">
            <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-cyan-300">
                  Latent Field
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={configureRun}
                    className="rounded border border-cyan-500 px-3 py-1 text-sm text-cyan-100 hover:bg-cyan-500/10 disabled:opacity-50"
                    disabled={streaming}
                  >
                    {run ? "Restart Run" : "Start Run"}
                  </button>
                  <button
                    type="button"
                    onClick={handleShare}
                    className="rounded border border-emerald-400 px-3 py-1 text-sm text-emerald-100 hover:bg-emerald-400/10 disabled:opacity-50"
                    disabled={!run || sharing}
                  >
                    {sharing ? "Sharing..." : "Share"}
                  </button>
                </div>
              </div>
              {shareInfo && (
                <p className="mt-2 text-xs text-emerald-200">{shareInfo}</p>
              )}
            {run && (
              <p className="mt-1 text-xs text-slate-400">
                seed: <span className="font-mono">{run.config.seed}</span> · K={" "}
                {run.config.K} · latent dim {run.config.latentDim}
              </p>
            )}
            <div className="mt-4 flex flex-col gap-3 md:flex-row">
              <BranchScope
                psi={psi}
                centers={branchCenters}
                selected={selectedBranch}
                suggested={suggestedBranch}
                className="w-full rounded border border-slate-800 bg-slate-900/70"
              />
              <div className="flex-1 space-y-2">
                <div className="rounded border border-slate-800 bg-slate-900/70 p-3 text-sm">
                  <p className="text-slate-300">
                    t = {time.toFixed(2)} · suggested branch{" "}
                    {suggestedBranch ?? "-"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Collapse pulls ψ toward the chosen branch after each
                    measurement.
                  </p>
                </div>
                <div className="rounded border border-slate-800 bg-slate-900/70 p-3">
                  <h3 className="text-sm font-semibold text-slate-200">
                    Energies
                  </h3>
                  <ul className="mt-2 space-y-1 font-mono text-xs text-slate-300">
                    {energies.map((energy, idx) => (
                      <li
                        key={`energy-${idx}`}
                        className={
                          idx === selectedBranch
                            ? "text-emerald-300"
                            : idx === suggestedBranch
                              ? "text-sky-300"
                              : undefined
                        }
                      >
                        #{idx} → {energy.toFixed(4)}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-4">
            <h2 className="text-lg font-semibold text-amber-300">
              Language Measurement
            </h2>
            <label className="mt-3 block text-sm text-slate-300">
              Prompt
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={4}
                className="mt-2 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
              />
            </label>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Weirdness controls temperature. 0 → deterministic, higher →
                exploratory.
              </p>
              <button
                type="button"
                onClick={handleMeasure}
                className="rounded border border-amber-400 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-400/10 disabled:opacity-50"
                disabled={!run}
              >
                Measure &amp; Play
              </button>
            </div>
            {summary && (
              <p className="mt-3 rounded border border-amber-300/40 bg-amber-300/10 p-3 text-xs text-amber-100">
                {summary}
              </p>
            )}
            {error && (
              <p className="mt-3 rounded border border-red-400/60 bg-red-500/10 p-3 text-xs text-red-200">
                {error}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-emerald-300">
                Evidence Metrics
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRecordPcm}
                  className="rounded border border-emerald-400 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-50"
                  disabled={!run || recording}
                >
                  {recording
                    ? `Recording ${RECORD_SECONDS}s...`
                    : `Record ${RECORD_SECONDS}s`}
                </button>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="rounded border border-slate-500 px-3 py-1 text-xs text-slate-200 hover:bg-slate-500/10 disabled:opacity-40"
                  disabled={!miSeries.length && !dwellSeries.length}
                >
                  Export CSV
                </button>
              </div>
            </div>

            <div className="mt-3 space-y-4 text-sm text-slate-200">
              <section>
                <h3 className="text-sm font-semibold text-slate-100">
                  Mutual Information vs Weirdness (T)
                </h3>
                {miSeries.length ? (
                  <ul className="mt-2 space-y-1 font-mono text-xs text-slate-300">
                    {miSeries.map(({ T, bits }) => (
                      <li key={`mi-${T.toFixed(2)}`}>
                        T={T.toFixed(2)} → {bits.toFixed(4)} bits
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-slate-400">
                    Measure a few prompts at different T values to populate
                    the MI curve.
                  </p>
                )}
              </section>

              <section>
                <h3 className="text-sm font-semibold text-slate-100">
                  Branch Dwell Times
                </h3>
                {dwellStats ? (
                  <p className="mt-2 font-mono text-xs text-slate-300">
                    mean {dwellStats.meanMs.toFixed(1)} ms · min{" "}
                    {dwellStats.minMs.toFixed(1)} ms · max{" "}
                    {dwellStats.maxMs.toFixed(1)} ms
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-slate-400">
                    Streaming in progress—dwell statistics activate once we
                    have a few hundred frames.
                  </p>
                )}
              </section>

              <section>
                <h3 className="text-sm font-semibold text-slate-100">
                  Spectral Fit (Welch PSD → Lorentzian amps)
                </h3>
                {psdAmps.length ? (
                  <ul className="mt-2 space-y-1 font-mono text-xs text-slate-300">
                    {psdAmps.map(({ freqHz, amp }, idx) => (
                      <li key={`amp-${idx}`}>
                        f0≈{freqHz.toFixed(1)} Hz → a={amp.toFixed(3)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-slate-400">
                    Capture a {RECORD_SECONDS}s snippet to estimate branch
                    peak amplitudes from the live spectrum.
                  </p>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelixObservablesPage;
