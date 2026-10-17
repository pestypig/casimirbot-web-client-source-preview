import type { QiControllerState, QiTileControllerState, QiControllerSafetyState } from "@shared/schema";
import { cn } from "@/lib/utils";

const FALLBACK = "--";

const fmt = (value: unknown, digits = 3) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return FALLBACK;
  return numeric.toFixed(digits);
};

const fmtPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

const radToDeg = (rad: number) => (rad * 180) / Math.PI;

const tileSafetyClass = (state: QiControllerSafetyState) => {
  switch (state) {
    case "OK":
      return "text-emerald-300";
    case "MARGIN_LOW":
      return "text-amber-300";
    case "QI_AT_RISK":
    case "HARD_STOP":
      return "text-rose-300";
    default:
      return "text-slate-300";
  }
};

const tileRoleMeta = (role?: QiTileControllerState["role"]) => {
  if (role === "pos") return { label: "Payback", className: "text-emerald-300" };
  if (role === "neg") return { label: "Negative", className: "text-rose-300" };
  return { label: "Neutral", className: "text-slate-300" };
};

const samplePhaseOffsets = (phases: number[], count: number) => {
  const total = phases.length;
  if (!total) return [];
  const samples = Math.min(count, total);
  const result: Array<{ index: number; phase: number }> = [];
  const step = total / samples;
  for (let i = 0; i < samples; i += 1) {
    const idx = Math.min(total - 1, Math.round(i * step));
    result.push({ index: idx, phase: phases[idx] });
  }
  if (result.length === samples && result[result.length - 1].index !== total - 1) {
    result[result.length - 1] = { index: total - 1, phase: phases[total - 1] };
  }
  return result;
};

export type QiTileGuardBandsProps = {
  controllerState?: QiControllerState | null;
  limit?: number;
  className?: string;
  title?: string;
  showPhaseSummary?: boolean;
  showIntentSummary?: boolean;
};

export function QiTileGuardBands({
  controllerState,
  limit = 10,
  className,
  title = "Tile guard bands",
  showPhaseSummary = true,
  showIntentSummary = true,
}: QiTileGuardBandsProps) {
  if (!controllerState) return null;
  const tiles = controllerState.tiles ?? [];
  const visible = tiles.slice(0, limit);
  const marginTarget = controllerState.marginTarget_Jm3 ?? 0;

  return (
    <section
      className={cn("rounded border border-slate-800/80 bg-slate-950/60 p-4 text-xs text-slate-300 space-y-3", className)}
    >
      <header className="flex items-center justify-between text-slate-400">
        <span className="uppercase tracking-wide">{title}</span>
        <span>
          Showing {visible.length} / {tiles.length} tiles
        </span>
      </header>
      {visible.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left">
            <thead className="text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-1 pr-2">Tile</th>
                <th className="py-1 pr-2">Role</th>
                <th className="py-1 pr-2">Gap target (nm)</th>
                <th className="py-1 pr-2">Duty target</th>
                <th className="py-1 pr-2">Tau (ms)</th>
                <th className="py-1 pr-2">Avg rho (J/m^3)</th>
                <th className="py-1 pr-2">Target margin</th>
                <th className="py-1 pr-2">Margin</th>
                <th className="py-1">Phase</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {visible.map((tile) => {
                const roleMeta = tileRoleMeta(tile.role);
                const targetMargin =
                  tile.targetMargin_Jm3 ??
                  controllerState.marginTarget_Jm3 ??
                  marginTarget;
                return (
                  <tr key={tile.tileId} className="border-t border-slate-800/60">
                    <td className="py-1 pr-2 font-medium text-slate-100">{tile.label ?? tile.tileId}</td>
                    <td className={cn("py-1 pr-2 text-xs font-semibold", roleMeta.className)}>{roleMeta.label}</td>
                    <td className="py-1 pr-2">{fmt(tile.gapTarget_nm, 2)}</td>
                    <td className="py-1 pr-2">{fmt(tile.dutyTarget, 4)}</td>
                    <td className="py-1 pr-2">{fmt(tile.tau_s * 1000, 2)}</td>
                    <td className="py-1 pr-2">{fmt(tile.rhoAvg_Jm3, 2)}</td>
                    <td className="py-1 pr-2">{fmt(targetMargin, 4)}</td>
                    <td className={cn("py-1 pr-2 font-semibold", tileSafetyClass(tile.safetyState))}>
                      {fmt(tile.margin_Jm3, 4)}
                    </td>
                    <td className="py-1 text-right font-mono text-xs text-slate-400">
                      {fmt(radToDeg(tile.drivePhaseTarget_rad ?? tile.drivePhase_rad), 2)} deg
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded border border-slate-800/60 bg-slate-900/40 p-3 text-[11px] text-slate-400">
          Server controller telemetry has no tiles yet. Waiting for the guard feed to boot.
        </p>
      )}
      {showPhaseSummary &&
      controllerState.staggering &&
      controllerState.staggering.phaseOffsets_rad &&
      controllerState.staggering.phaseOffsets_rad.length ? (
        <p className="text-[11px] text-slate-400">
          {controllerState.staggering.strategy} staggering · {controllerState.staggering.sectorCount} sectors @{" "}
          {fmt(controllerState.staggering.repRate_Hz, 1)} Hz. Phase samples:{" "}
          {samplePhaseOffsets(controllerState.staggering.phaseOffsets_rad, 6)
            .map(({ index, phase }) => `${index}: ${fmt(radToDeg(phase), 1)} deg`)
            .join(", ")}
          .
        </p>
      ) : null}
      {showIntentSummary && controllerState.intents?.length ? (
        <div className="text-[11px] text-slate-400">
          <span className="font-semibold text-slate-300">Active intents:</span>{" "}
          {controllerState.intents
            .map((intent) => `${intent.intent} (${fmtPercent(intent.aggressiveness ?? 0.5)})`)
            .join(", ")}
        </div>
      ) : null}
    </section>
  );
}
