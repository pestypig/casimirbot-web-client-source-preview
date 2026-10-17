import { type HcePeak } from "@shared/hce-types";

type ConfigKeys = "rc" | "tau" | "beta" | "lambda" | "dt" | "K";

type ConfigPatch = Partial<Record<ConfigKeys, number>>;

export interface ObservablesPanelProps {
  rc: number;
  tau: number;
  beta: number;
  lambda: number;
  dt: number;
  K: number;
  weirdness: number;
  peaks: HcePeak[];
  onConfigChange: (patch: ConfigPatch) => void;
  onPeaksChange: (peaks: HcePeak[]) => void;
  onWeirdnessChange: (value: number) => void;
  disabled?: boolean;
}

const ObservablesPanel = ({
  rc,
  tau,
  beta,
  lambda,
  dt,
  K,
  weirdness,
  peaks,
  onConfigChange,
  onPeaksChange,
  onWeirdnessChange,
  disabled = false,
}: ObservablesPanelProps) => {
  const updatePeak = (index: number, field: keyof HcePeak, value: number) => {
    const next = peaks.map((peak, idx) =>
      idx === index ? { ...peak, [field]: value } : peak,
    );
    onPeaksChange(next);
  };

  const removePeak = (index: number) => {
    const next = peaks.filter((_, idx) => idx !== index);
    onPeaksChange(next);
  };

  const addPeak = () => {
    const next: HcePeak[] = [
      ...peaks,
      { omega: 3 + peaks.length, gamma: 0.2, alpha: 1 },
    ];
    onPeaksChange(next);
  };

  return (
    <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/70 p-4 text-slate-100">
      <h2 className="text-lg font-semibold">Helix Collapse Parameters</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <Field
          label="Correlation length (rₚ)"
          value={rc}
          min={0}
          max={1}
          step={0.01}
          disabled={disabled}
          onChange={(value) => onConfigChange({ rc: value })}
        />
        <Field
          label="Relaxation time (τ)"
          value={tau}
          min={0.2}
          max={6}
          step={0.1}
          disabled={disabled}
          onChange={(value) => onConfigChange({ tau: value })}
        />
        <Field
          label="Language bias (β)"
          value={beta}
          min={0}
          max={1.5}
          step={0.05}
          disabled={disabled}
          onChange={(value) => onConfigChange({ beta: value })}
        />
        <Field
          label="Energy blend (λ)"
          value={lambda}
          min={0}
          max={1}
          step={0.05}
          disabled={disabled}
          onChange={(value) => onConfigChange({ lambda: value })}
        />
        <Field
          label="Time step (Δt)"
          value={dt}
          min={0.02}
          max={0.3}
          step={0.01}
          disabled={disabled}
          onChange={(value) => onConfigChange({ dt: value })}
        />
        <Field
          label="Branches (K)"
          value={K}
          min={2}
          max={6}
          step={1}
          disabled={disabled}
          onChange={(value) => onConfigChange({ K: Math.round(value) })}
        />
        <Field
          label="Weirdness (T)"
          value={weirdness}
          min={0}
          max={2}
          step={0.05}
          disabled={disabled}
          onChange={(value) => onWeirdnessChange(value)}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Spectral peaks S(ω)</h3>
          <button
            type="button"
            onClick={addPeak}
            className="rounded border border-slate-700 px-2 py-1 text-sm hover:border-slate-500 disabled:opacity-50"
            disabled={disabled}
          >
            Add Peak
          </button>
        </div>
        <div className="space-y-2">
          {peaks.length === 0 ? (
            <p className="text-sm text-slate-400">
              No peaks configured. Add one to introduce resonances.
            </p>
          ) : (
            peaks.map((peak, idx) => (
              <div
                key={`peak-${idx}`}
                className="grid gap-2 rounded border border-slate-800 bg-slate-900/60 p-2 text-sm md:grid-cols-[repeat(3,minmax(0,1fr))_auto]"
              >
                <NumberField
                  label="ω"
                  value={peak.omega}
                  min={0.5}
                  max={32}
                  step={0.5}
                  disabled={disabled}
                  onChange={(value) => updatePeak(idx, "omega", value)}
                />
                <NumberField
                  label="γ"
                  value={peak.gamma}
                  min={0.05}
                  max={2}
                  step={0.05}
                  disabled={disabled}
                  onChange={(value) => updatePeak(idx, "gamma", value)}
                />
                <NumberField
                  label="α"
                  value={peak.alpha}
                  min={0.1}
                  max={4}
                  step={0.1}
                  disabled={disabled}
                  onChange={(value) => updatePeak(idx, "alpha", value)}
                />
                <button
                  type="button"
                  onClick={() => removePeak(idx)}
                  className="justify-self-end rounded border border-slate-700 px-2 py-1 hover:border-red-400 hover:text-red-200 disabled:opacity-40"
                  disabled={disabled}
                  aria-label={`Remove peak ${idx + 1}`}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

interface FieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
}

const Field = ({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: FieldProps) => (
  <label className="flex flex-col gap-1 text-sm">
    <span className="text-slate-300">{label}</span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-full accent-cyan-400"
    />
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1"
    />
  </label>
);

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
}

const NumberField = ({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: NumberFieldProps) => (
  <label className="flex flex-col gap-1 text-xs">
    <span className="text-slate-400">{label}</span>
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
    />
  </label>
);

export default ObservablesPanel;
