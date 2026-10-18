import { type ChangeEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useHelixStartSettings } from "@/hooks/useHelixStartSettings";
import { getInterfaceLanguageOption } from "@/lib/i18n/interfaceLanguage";
import { useInterfaceText } from "@/lib/i18n/interfaceText";
import { useScientificCalculatorLiveSourceStore } from "@/store/useScientificCalculatorLiveSourceStore";

export function ScientificCalculatorLiveSourceControls({ currentEquation }: { currentEquation: string }) {
  const { userSettings } = useHelixStartSettings();
  const interfaceLanguage = getInterfaceLanguageOption(userSettings.interfaceLanguage);
  const { t } = useInterfaceText(interfaceLanguage.code);
  const {
    status,
    mode,
    sourceId,
    environmentId,
    tickRateMs,
    maxTicks,
    state,
    equationState,
    sourceEquation,
    latestTick,
    liveWorkbenchExpression,
    liveSolveSteps,
    activeLiveStepId,
    debugLog,
    startEquationLiveSource,
    startPrimeStream,
    stopPrimeStream,
    restartPrimeStream,
    copyDebugLog,
  } = useScientificCalculatorLiveSourceStore();
  const [sourceMode, setSourceMode] = useState<"current_equation" | "prime_trial_division">("current_equation");
  const [start, setStart] = useState("2");
  const [rate, setRate] = useState("1000");
  const [max, setMax] = useState("1");
  const [equationContext, setEquationContext] = useState(() => t("scientificCalculator.live.contextDefault"));
  const sourceEquationPreview = sourceMode === "prime_trial_division"
    ? "n \\bmod d = r"
    : currentEquation.trim();
  const missingCurrentEquation = sourceMode === "current_equation" && !sourceEquationPreview;
  const activeSeq = mode === "current_equation" ? equationState.seq : state.seq;

  const startStream = () => {
    if (sourceMode === "prime_trial_division") {
      void startPrimeStream({
        start: Number(start),
        tickRateMs: Number(rate),
        maxTicks: Number(max) || 100,
      });
      return;
    }
    void startEquationLiveSource({
      equation: currentEquation,
      equationContext,
      tickRateMs: Number(rate),
      maxTicks: Number(max) || 1,
      mode: "current_equation",
    });
  };

  const copyLog = () => {
    const log = copyDebugLog();
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(log);
    }
  };

  return (
    <div className="mt-3 rounded-md border border-cyan-900/60 bg-cyan-950/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-cyan-300">{t("scientificCalculator.live.title")}</div>
          <div className="text-xs text-slate-400">
            {t("scientificCalculator.live.description")}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="border-cyan-700 text-cyan-100">status: {status}</Badge>
          <Badge variant="outline" className="border-cyan-700 text-cyan-100">mode: {mode}</Badge>
          <Badge variant="outline" className="border-cyan-700 text-cyan-100">seq: {activeSeq}</Badge>
          <Badge variant="outline" className="border-cyan-700 text-cyan-100">rate: {tickRateMs}ms</Badge>
        </div>
      </div>
      <div className="mt-3 rounded border border-slate-800 bg-slate-950/50 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">{t("scientificCalculator.live.sourceEquation")}</div>
            <div className={`mt-1 break-words font-mono text-[11px] ${missingCurrentEquation ? "text-red-300" : "text-cyan-50"}`}>
              {sourceEquationPreview || t("scientificCalculator.live.missingEquation")}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button data-helix-control-id="workstation.panel.scientific-calculator.scientific-calculator-live-source-controls.set-source-mode-current-equation-set-max-1" data-helix-interaction-kind="configure" data-helix-authority-state="client_local"
              size="sm"
              variant={sourceMode === "current_equation" ? "default" : "outline"}
              className={sourceMode === "current_equation" ? "bg-cyan-600 hover:bg-cyan-700" : ""}
              onClick={() => {
                setSourceMode("current_equation");
                setMax("1");
              }}
            >
              {t("scientificCalculator.live.currentEquation")}
            </Button>
            <Button data-helix-control-id="workstation.panel.scientific-calculator.scientific-calculator-live-source-controls.set-source-mode-prime-trial-division-set-max-100" data-helix-interaction-kind="configure" data-helix-authority-state="client_local"
              size="sm"
              variant={sourceMode === "prime_trial_division" ? "default" : "outline"}
              className={sourceMode === "prime_trial_division" ? "bg-cyan-600 hover:bg-cyan-700" : ""}
              onClick={() => {
                setSourceMode("prime_trial_division");
                setMax("100");
              }}
            >
              {t("scientificCalculator.live.primePreset")}
            </Button>
          </div>
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <div>
          <Label className="text-[11px] text-slate-300">
            {sourceMode === "prime_trial_division" ? t("scientificCalculator.live.candidateStart") : t("scientificCalculator.live.repeats")}
          </Label>
          <Input data-helix-control-id="workstation.panel.scientific-calculator.scientific-calculator-live-source-controls.input" data-helix-interaction-kind="configure" data-helix-authority-state="client_local"
            value={sourceMode === "prime_trial_division" ? start : max}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              if (sourceMode === "prime_trial_division") setStart(event.target.value);
              else setMax(event.target.value);
            }}
            className="h-8 border-slate-700 bg-slate-950 text-xs text-slate-100"
          />
        </div>
        <div>
          <Label className="text-[11px] text-slate-300">{t("scientificCalculator.live.tickRateMs")}</Label>
          <Input data-helix-control-id="workstation.panel.scientific-calculator.scientific-calculator-live-source-controls.input.2" data-helix-interaction-kind="configure" data-helix-authority-state="client_local" value={rate} onChange={(event: ChangeEvent<HTMLInputElement>) => setRate(event.target.value)} className="h-8 border-slate-700 bg-slate-950 text-xs text-slate-100" />
        </div>
        <div>
          <Label className="text-[11px] text-slate-300">{t("scientificCalculator.live.maxTicks")}</Label>
          <Input data-helix-control-id="workstation.panel.scientific-calculator.scientific-calculator-live-source-controls.input.3" data-helix-interaction-kind="configure" data-helix-authority-state="client_local"
            value={max}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setMax(event.target.value)}
            className="h-8 border-slate-700 bg-slate-950 text-xs text-slate-100"
          />
        </div>
      </div>
      {sourceMode === "current_equation" ? (
        <div className="mt-3">
          <Label className="text-[11px] text-slate-300">{t("scientificCalculator.live.interpretationContext")}</Label>
          <Input data-helix-control-id="workstation.panel.scientific-calculator.scientific-calculator-live-source-controls.input.4" data-helix-interaction-kind="configure" data-helix-authority-state="client_local"
            value={equationContext}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setEquationContext(event.target.value)}
            className="mt-1 h-8 border-slate-700 bg-slate-950 text-xs text-slate-100"
            placeholder={t("scientificCalculator.live.contextPlaceholder")}
          />
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button data-helix-control-id="workstation.panel.scientific-calculator.scientific-calculator-live-source-controls.start-stream" data-helix-interaction-kind="act" data-helix-authority-state="client_local" size="sm" className="bg-cyan-600 hover:bg-cyan-700" onClick={startStream} disabled={missingCurrentEquation}>{t("scientificCalculator.live.start")}</Button>
        <Button data-helix-control-id="workstation.panel.scientific-calculator.scientific-calculator-live-source-controls.stop-prime-stream" data-helix-interaction-kind="act" data-helix-authority-state="client_local" size="sm" variant="outline" onClick={stopPrimeStream}>{t("scientificCalculator.live.stop")}</Button>
        <Button data-helix-control-id="workstation.panel.scientific-calculator.scientific-calculator-live-source-controls.void-restart-prime-stream" data-helix-interaction-kind="act" data-helix-authority-state="client_local" size="sm" variant="outline" onClick={() => void restartPrimeStream()}>{t("scientificCalculator.live.restart")}</Button>
        <Button data-helix-control-id="workstation.panel.scientific-calculator.scientific-calculator-live-source-controls.copy-log" data-helix-interaction-kind="act" data-helix-authority-state="client_local" size="sm" variant="outline" onClick={copyLog}>{t("scientificCalculator.live.copyDebugLog")}</Button>
      </div>
      <div className="mt-3 grid gap-2 text-[11px] text-slate-300 lg:grid-cols-2">
        <div className="rounded border border-slate-800 bg-slate-950/50 p-2">
          <div className="text-slate-500">{t("scientificCalculator.live.attachedEnvironment")}</div>
          <div className="break-all font-mono">{environmentId ?? t("scientificCalculator.live.environmentFallback")}</div>
        </div>
        <div className="rounded border border-slate-800 bg-slate-950/50 p-2">
          <div className="text-slate-500">{t("scientificCalculator.live.latestEvent")}</div>
          <div className="font-mono">
            {latestTick
              ? latestTick.event_type === "equation_evaluated"
                ? `${latestTick.event_type} ${latestTick.payload.ok ? "ok" : "blocked"}`
                : `${latestTick.event_type} ${latestTick.payload.candidate}`
              : "none"}
          </div>
          <div className="text-slate-500">{sourceId}</div>
        </div>
      </div>
      <div className="mt-3 rounded border border-cyan-800/70 bg-slate-950/60 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-cyan-300">{t("scientificCalculator.live.visibleSolve")}</div>
            <div className="text-[11px] text-slate-400">
              {t("scientificCalculator.live.visibleSolveDescription")}
            </div>
          </div>
          <Badge variant="outline" className="border-cyan-700 text-cyan-100">
            {latestTick ? latestTick.trace.algorithm : sourceEquation || t("scientificCalculator.live.waiting")}
          </Badge>
        </div>
        <pre className="mt-2 max-h-32 overflow-auto rounded border border-slate-800 bg-black/30 p-2 font-mono text-[11px] leading-relaxed text-cyan-50">
          {liveWorkbenchExpression || sourceEquationPreview || t("scientificCalculator.live.startToPopulate")}
        </pre>
        {liveSolveSteps.length > 0 ? (
          <div className="mt-2 grid gap-1.5 md:grid-cols-5">
            {liveSolveSteps.map((step) => (
              <div
                key={step.id}
                className={`rounded border px-2 py-1.5 text-[10px] ${
                  step.id === activeLiveStepId
                    ? "border-cyan-300 bg-cyan-400/15 text-cyan-50 shadow-[0_0_18px_rgba(34,211,238,0.25)]"
                    : "border-slate-800 bg-slate-950/50 text-slate-300"
                }`}
              >
                <div className="uppercase tracking-wide text-slate-500">{step.label}</div>
                <div className="mt-1 break-words font-mono">{step.value}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {debugLog.length > 0 ? (
        <div className="mt-2 max-h-24 overflow-auto rounded border border-slate-800 bg-slate-950/40 p-2 font-mono text-[10px] text-slate-400">
          {debugLog.slice(0, 8).map((entry: string, index: number) => <div key={`${entry}:${index}`}>{entry}</div>)}
        </div>
      ) : null}
    </div>
  );
}
