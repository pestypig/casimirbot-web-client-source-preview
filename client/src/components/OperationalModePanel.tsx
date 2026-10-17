import React, { useEffect, useState } from "react";
import { Loader2, Zap } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MODE_CONFIGS,
  type ModeKey,
  useEnergyPipeline,
  useSwitchMode,
  useUpdatePipeline,
} from "@/hooks/use-energy-pipeline";

const QUICK_MODE_KEYS: ModeKey[] = ["standby", "hover", "nearzero", "cruise", "emergency"];

const descriptionFor = (mode: ModeKey) => {
  const cfg = MODE_CONFIGS[mode];
  return cfg?.hint ?? cfg?.description ?? "Switch instantly";
};

const formatPercent = (value?: number) =>
  Number.isFinite(value) ? `${((value as number) * 100).toFixed(2)}%` : "—";

type ParameterKey = "gammaGeo" | "qCavity" | "dutyCycle" | "exoticMassTarget_kg";
type ParameterDraft = Record<ParameterKey, string>;

const fromPipeline = (data: {
  gammaGeo?: number;
  qCavity?: number;
  dutyCycle?: number;
  exoticMassTarget_kg?: number;
} | undefined): ParameterDraft => ({
  gammaGeo: data?.gammaGeo?.toString() ?? "",
  qCavity: data?.qCavity?.toString() ?? "",
  dutyCycle: data?.dutyCycle?.toString() ?? "",
  exoticMassTarget_kg: data?.exoticMassTarget_kg?.toString() ?? "",
});

const PARAMETERS: { key: ParameterKey; label: string; unit: string }[] = [
  { key: "gammaGeo", label: "Geometry factor", unit: "dimensionless" },
  { key: "qCavity", label: "Cavity Q", unit: "dimensionless" },
  { key: "dutyCycle", label: "Duty cycle", unit: "fraction 0–1" },
  { key: "exoticMassTarget_kg", label: "Exotic mass target", unit: "kg; target only" },
];

export default function OperationalModePanel() {
  const { data, isLoading } = useEnergyPipeline({ refetchInterval: 2000 });
  const switchMode = useSwitchMode();
  const updatePipeline = useUpdatePipeline();
  const [draft, setDraft] = useState<ParameterDraft>(() => fromPipeline(undefined));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [betaDraft, setBetaDraft] = useState("");
  const [betaDirty, setBetaDirty] = useState(false);
  const [betaError, setBetaError] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty && !updatePipeline.isPending) setDraft(fromPipeline(data));
  }, [data, dirty, updatePipeline.isPending]);

  useEffect(() => {
    if (!betaDirty && !updatePipeline.isPending) {
      setBetaDraft(Number.isFinite(data?.beta_trans) ? String(data?.beta_trans) : "");
    }
  }, [data?.beta_trans, betaDirty, updatePipeline.isPending]);

  const currentMode = (data?.currentMode ?? "hover") as ModeKey;
  const dutyFR = data?.dutyEffectiveFR ?? data?.dutyCycle;

  const handleSwitch = (mode: ModeKey) => {
    if (mode === currentMode || switchMode.isPending) return;
    switchMode.mutate(mode);
  };

  const saveParameters = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const values = Object.fromEntries(
      PARAMETERS.map(({ key }) => [key, Number(draft[key])]),
    ) as Record<ParameterKey, number>;
    if (PARAMETERS.some(({ key }) => !draft[key].trim() || !Number.isFinite(values[key])) ||
        values.gammaGeo < 1 || values.qCavity <= 0 ||
        values.dutyCycle < 0 || values.dutyCycle > 1 || values.exoticMassTarget_kg < 0) {
      setError("Enter finite values: geometry ≥ 1, Q > 0, duty 0–1, target ≥ 0.");
      return;
    }
    try {
      await updatePipeline.mutateAsync(values);
      setDirty(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const saveBetaTrans = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBetaError(null);
    const value = Number(betaDraft);
    if (!betaDraft.trim() || !Number.isFinite(value) || value < 0 || value > 1) {
      setBetaError("Enter a finite beta_trans fraction from 0 to 1.");
      return;
    }
    try {
      await updatePipeline.mutateAsync({ beta_trans: value });
      setBetaDirty(false);
    } catch (reason) {
      setBetaError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm font-semibold">Operational Modes</CardTitle>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide w-fit">
            <Zap className="mr-1 h-3 w-3 text-cyan-300" />
            Live
          </Badge>
        </div>
        <CardDescription className="text-xs">
          Switch HELIX drive posture from any workspace. Buttons call the same server hooks as
          /helix-core.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_MODE_KEYS.map((mode) => {
            const cfg = MODE_CONFIGS[mode];
            if (!cfg) return null;
            const active = currentMode === mode;
            return (
              <Button
                key={mode}
                variant={active ? "default" : "outline"}
                className="h-16 w-full flex flex-col items-start justify-between text-left"
                disabled={switchMode.isPending}
                onClick={() => handleSwitch(mode)}
              >
                <span className="font-mono text-sm">{cfg.name}</span>
                <span className="text-[11px] leading-tight opacity-80">{descriptionFor(mode)}</span>
              </Button>
            );
          })}
        </div>
        <div className="rounded-lg border border-slate-800/80 bg-slate-950/70 p-3 text-xs text-slate-300 font-mono">
          <div className="flex items-center gap-2">
            <span>Active:</span>
            <span className="text-slate-100">{MODE_CONFIGS[currentMode]?.name ?? currentMode}</span>
            {(isLoading || switchMode.isPending) && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-3">
            <span>Duty (FR): {formatPercent(dutyFR)}</span>
            <span>Sectors live: {MODE_CONFIGS[currentMode]?.sectorsConcurrent ?? "—"}</span>
            <span>Local burst: {formatPercent(MODE_CONFIGS[currentMode]?.localBurstFrac)}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-3">
            <span>Pipeline claim tier: {data?.claim_tier ?? "unreported"}</span>
            <span>Pipeline provenance: {data?.provenance_class ?? "unreported"}</span>
          </div>
        </div>
        <details className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-300">
          <summary className="cursor-pointer font-semibold text-slate-100">Developer pipeline parameters</summary>
          <p className="mt-2 text-amber-200">
            These edit the live HELIX mechanism. They are not selected-run NHM2 solve inputs or proof receipts.
            Opening this panel makes no parameter changes.
          </p>
          <form className="mt-3 space-y-3" onSubmit={saveParameters}>
            <div className="grid gap-3 sm:grid-cols-2">
              {PARAMETERS.map(({ key, label, unit }) => (
                <label key={key} className="space-y-1">
                  <span className="block">{label} <span className="text-slate-500">({unit})</span></span>
                  <input
                    type="number"
                    step="any"
                    value={draft[key]}
                    onChange={(event) => {
                      setDraft((current) => ({ ...current, [key]: event.target.value }));
                      setDirty(true);
                    }}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
                  />
                </label>
              ))}
            </div>
            {error ? <p role="alert" className="text-rose-300">{error}</p> : null}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={!data || !dirty || updatePipeline.isPending}>
                {updatePipeline.isPending ? "Saving…" : "Apply to live pipeline"}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={updatePipeline.isPending}
                onClick={() => { setDraft(fromPipeline(data)); setDirty(false); setError(null); }}>
                Reset draft
              </Button>
            </div>
          </form>
          <form className="mt-4 space-y-2 border-t border-slate-800 pt-3" onSubmit={saveBetaTrans}>
            <label className="block space-y-1">
              <span>Translation bias beta_trans <span className="text-slate-500">(fraction 0–1; live visual/control input)</span></span>
              <input
                type="number"
                min="0"
                max="1"
                step="any"
                value={betaDraft}
                onChange={(event) => { setBetaDraft(event.target.value); setBetaDirty(true); }}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100 sm:max-w-48"
              />
            </label>
            <p className="text-slate-400">Reported live value: {Number.isFinite(data?.beta_trans) ? data?.beta_trans : "unreported"}. This is a developer input, not a measured speed or selected-run transport result.</p>
            {betaError ? <p role="alert" className="text-rose-300">{betaError}</p> : null}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={!data || !betaDirty || updatePipeline.isPending}>Apply beta_trans</Button>
              <Button type="button" size="sm" variant="outline" disabled={updatePipeline.isPending}
                onClick={() => { setBetaDraft(Number.isFinite(data?.beta_trans) ? String(data?.beta_trans) : ""); setBetaDirty(false); setBetaError(null); }}>
                Reset draft
              </Button>
            </div>
          </form>
        </details>
      </CardContent>
    </Card>
  );
}

