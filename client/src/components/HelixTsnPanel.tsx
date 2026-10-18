import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { SimResult, Flow } from "@shared/tsn-sim";
import { usePanelTelemetryPublisher } from "@/lib/desktop/panelTelemetryBus";

const DEFAULT_CTRL_FLOW: Flow = {
  name: "ctrl-loop",
  priority: 0,
  sizeBytes: 256,
  intervalCycles: 1,
  jitterNs: 20_000,
  hops: 3,
  linkSpeedMbps: 1000,
  deadlineNs: 300_000,
  preemptible: true,
  cutThrough: true,
};

const DEFAULT_TLM_FLOW: Flow = {
  name: "telemetry",
  priority: 2,
  sizeBytes: 1500,
  intervalCycles: 2,
  jitterNs: 50_000,
  hops: 3,
  linkSpeedMbps: 1000,
  deadlineNs: 800_000,
  preemptible: false,
  cutThrough: false,
};

type RunPayload = {
  cycles: number;
  cycleNs: number;
  controlWindowNs: number;
  guardBandNs: number;
  hopLatencyNs: number;
  dropProbability: number;
  lateInjectionNs: number;
  lateEveryNCycles: number;
  ber: number;
  crcDetects: number;
  driftPpm: number;
  servoGain: number;
  gmStepNs: number;
  gmStepAtCycle: number;
  framesLimit: number;
  preemptibleCtrl: boolean;
  cutThroughCtrl: boolean;
};

const DEFAULT_PAYLOAD: RunPayload = {
  cycles: 20,
  cycleNs: 1_000_000,
  controlWindowNs: 200_000,
  guardBandNs: 20_000,
  hopLatencyNs: 500,
  dropProbability: 0.02,
  lateInjectionNs: 80_000,
  lateEveryNCycles: 4,
  ber: 1e-8,
  crcDetects: 0.999999,
  driftPpm: 10,
  servoGain: 0.2,
  gmStepNs: 5_000,
  gmStepAtCycle: 6,
  framesLimit: 300,
  preemptibleCtrl: true,
  cutThroughCtrl: true,
};

async function runTsnSim(payload: RunPayload): Promise<SimResult> {
  const schedule = {
    cycleNs: payload.cycleNs,
    windows: [
      {
        name: "control-high",
        startNs: 0,
        endNs: payload.controlWindowNs,
        priorities: [0],
        guardBandNs: payload.preemptibleCtrl ? 0 : payload.guardBandNs,
      },
      {
        name: "best-effort",
        startNs: payload.controlWindowNs,
        endNs: payload.cycleNs,
        priorities: [1, 2, 3],
        guardBandNs: 0,
      },
    ],
  };

  const flows: Flow[] = [
    { ...DEFAULT_CTRL_FLOW, preemptible: payload.preemptibleCtrl, cutThrough: payload.cutThroughCtrl },
    { ...DEFAULT_TLM_FLOW },
  ];

  const faults = {
    dropProbability: payload.dropProbability,
    lateInjectionNs: payload.lateInjectionNs,
    lateEveryNCycles: payload.lateEveryNCycles,
    clockStepNs: payload.gmStepNs,
    clockStepAtCycle: payload.gmStepAtCycle,
    ber: payload.ber,
    crcDetects: payload.crcDetects,
  };

  const clock = {
    driftPpm: payload.driftPpm,
    servoGain: payload.servoGain,
    noiseNs: 200,
    gmStepNs: payload.gmStepNs,
    gmStepAtCycle: payload.gmStepAtCycle,
  };

  const res = await fetch("/api/sim/tsn", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      schedule,
      flows,
      cycles: payload.cycles,
      hopLatencyNs: payload.hopLatencyNs,
      faults,
      clock,
      framesLimit: payload.framesLimit,
    }),
  });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(`TSN sim failed (${res.status}): ${message}`);
  }
  return (await res.json()) as SimResult;
}

const NumberInput = ({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  step?: string;
  onChange: (n: number) => void;
}) => (
  <div className="space-y-1">
    <Label className="text-xs text-slate-300">{label}</Label>
    <Input
      type="number"
      className="bg-slate-900/60 border-slate-700 text-sm"
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  </div>
);

export default function HelixTsnPanel() {
  const [form, setForm] = useState<RunPayload>(DEFAULT_PAYLOAD);
  const [result, setResult] = useState<SimResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  usePanelTelemetryPublisher(
    "tsn-sim",
    () => {
      if (!result) return null;
      return {
        kind: "sim.tsn",
        metrics: {
          frames: result.summary.total,
          delivered: result.summary.delivered,
          windowMiss: result.summary.windowMiss,
          deadlineMiss: result.summary.deadlineMiss,
          dropped: result.summary.dropped,
          crcEscapes: result.summary.crcUndetected,
        },
        strings: { lastRun: new Date().toISOString() },
        sourceIds: ["client/src/components/HelixTsnPanel.tsx"],
      };
    },
    [result],
  );

  const topMisses = useMemo(() => {
    if (!result) return [];
    return result.frames
      .filter((f) => !f.fitsWindow || f.deadlineHit === false || f.dropped || f.crcUndetected)
      .slice(0, 12);
  }, [result]);

  const handleRun = async () => {
    setBusy(true);
    setError(null);
    try {
      const sim = await runTsnSim(form);
      setResult(sim);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[360px,1fr] gap-4 text-slate-100 bg-slate-950/60 h-full overflow-auto p-4">
      <Card className="bg-slate-900/70 border-slate-700">
        <CardHeader>
          <CardTitle className="text-lg">TSN / Qbv Inputs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <NumberInput label="Cycles" value={form.cycles} onChange={(n) => setForm((f) => ({ ...f, cycles: n }))} />
            <NumberInput
              label="Cycle (ns)"
              value={form.cycleNs}
              onChange={(n) => setForm((f) => ({ ...f, cycleNs: n }))}
            />
            <NumberInput
              label="Control window (ns)"
              value={form.controlWindowNs}
              onChange={(n) => setForm((f) => ({ ...f, controlWindowNs: n }))}
            />
            <NumberInput
              label="Guard band (ns)"
              value={form.guardBandNs}
              onChange={(n) => setForm((f) => ({ ...f, guardBandNs: n }))}
            />
            <NumberInput
              label="Hop latency (ns)"
              value={form.hopLatencyNs}
              onChange={(n) => setForm((f) => ({ ...f, hopLatencyNs: n }))}
            />
            <NumberInput
              label="Frames limit"
              value={form.framesLimit}
              onChange={(n) => setForm((f) => ({ ...f, framesLimit: n }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumberInput
              label="Drop probability"
              step="0.001"
              value={form.dropProbability}
              onChange={(n) => setForm((f) => ({ ...f, dropProbability: n }))}
            />
            <NumberInput
              label="Late inject (ns)"
              value={form.lateInjectionNs}
              onChange={(n) => setForm((f) => ({ ...f, lateInjectionNs: n }))}
            />
            <NumberInput
              label="Late every N cycles"
              value={form.lateEveryNCycles}
              onChange={(n) => setForm((f) => ({ ...f, lateEveryNCycles: n }))}
            />
            <NumberInput
              label="BER"
              step="0.0000000001"
              value={form.ber}
              onChange={(n) => setForm((f) => ({ ...f, ber: n }))}
            />
            <NumberInput
              label="CRC detect (0-1)"
              step="0.000001"
              value={form.crcDetects}
              onChange={(n) => setForm((f) => ({ ...f, crcDetects: n }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumberInput
              label="Drift (ppm)"
              step="0.1"
              value={form.driftPpm}
              onChange={(n) => setForm((f) => ({ ...f, driftPpm: n }))}
            />
            <NumberInput
              label="Servo gain"
              step="0.05"
              value={form.servoGain}
              onChange={(n) => setForm((f) => ({ ...f, servoGain: n }))}
            />
            <NumberInput
              label="GM step (ns)"
              value={form.gmStepNs}
              onChange={(n) => setForm((f) => ({ ...f, gmStepNs: n }))}
            />
            <NumberInput
              label="GM step at cycle"
              value={form.gmStepAtCycle}
              onChange={(n) => setForm((f) => ({ ...f, gmStepAtCycle: n }))}
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={form.preemptibleCtrl}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, preemptibleCtrl: checked }))}
              />
              <span className="text-sm text-slate-200">Control preemptible</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.cutThroughCtrl}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, cutThroughCtrl: checked }))}
              />
              <span className="text-sm text-slate-200">Cut-through ctrl</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleRun} disabled={busy} className="w-full">
              {busy ? "Simulating..." : "Run TSN Simulation"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setForm(DEFAULT_PAYLOAD);
                setError(null);
              }}
            >
              Reset
            </Button>
          </div>
          {error && <div className="text-sm text-red-400">{error}</div>}
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-700 overflow-hidden">
        <CardHeader>
          <CardTitle className="text-lg">Results</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!result && <div className="text-slate-400 text-sm">Run the simulator to see summary and FM log.</div>}
          {result && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-slate-400 text-xs">Frames</div>
                  <div className="font-semibold">{result.summary.total} total</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Window miss</div>
                  <div className="font-semibold">{result.summary.windowMiss}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Deadline miss</div>
                  <div className="font-semibold">{result.summary.deadlineMiss}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Drops / CRC escape</div>
                  <div className="font-semibold">
                    {result.summary.dropped} / {result.summary.crcUndetected}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-slate-400">Fault management states</div>
                <div className="bg-slate-950/40 border border-slate-800 rounded p-2 max-h-32 overflow-auto text-xs space-y-1">
                  {result.fm.length === 0 && <div className="text-slate-500">No transitions</div>}
                  {result.fm.map((entry) => (
                    <div key={`${entry.cycle}-${entry.state}`}>
                      cycle {entry.cycle}: {entry.state}
                      {entry.reason ? ` (${entry.reason})` : ""}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-slate-400">First misses / drops</div>
                <div className="bg-slate-950/40 border border-slate-800 rounded p-2 max-h-48 overflow-auto text-xs space-y-1">
                  {topMisses.length === 0 && <div className="text-slate-500">All frames met schedule/deadlines</div>}
                  {topMisses.map((f, idx) => (
                    <div key={`${f.flow}-${f.cycle}-${idx}`} className="flex justify-between gap-2">
                      <span>
                        {f.flow} · cycle {f.cycle} · {f.window ?? "no window"}
                      </span>
                      <span className="text-right text-slate-400">
                        {f.dropped ? "dropped" : ""}
                        {!f.fitsWindow ? " window-miss" : ""}
                        {f.deadlineHit === false ? " deadline-miss" : ""}
                        {f.crcUndetected ? " crc-escape" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-slate-400">Sample frames</div>
                <div className="bg-slate-950/40 border border-slate-800 rounded p-2 max-h-48 overflow-auto text-xs space-y-1">
                  {result.frames.slice(0, 10).map((f, idx) => (
                    <div key={`${f.flow}-${f.cycle}-sample-${idx}`} className="flex justify-between gap-2">
                      <span>
                        {f.flow} @ {f.sentAtNs.toFixed(0)} ns → {f.e2eLatencyNs ?? "—"} ns
                      </span>
                      <span className="text-slate-400">
                        window={f.window ?? "none"}, deadline={f.deadlineHit === false ? "miss" : "ok"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
