import { Activity, Zap, Clock, Power, BarChart3, Settings } from "lucide-react";
import { UseFormReturn } from "react-hook-form";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SimulationParameters, DEFAULT_GEOMETRY_SWEEP, DEFAULT_PHASE_MICRO_SWEEP } from "@shared/schema";
import { useEnergyPipeline } from "@/hooks/use-energy-pipeline";

const parseNumberList = (value: string): number[] =>
  value
    .split(/[,\s]+/)
    .map((token) => Number(token))
    .filter((num) => Number.isFinite(num));

const parseRange = (value: string): number[] | null => {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const [, startStr, endStr, stepStr] = match;
  const start = Number(startStr);
  const end = Number(endStr);
  const step = Number(stepStr);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(step) || step === 0) {
    return [];
  }
  const out: number[] = [];
  if (step > 0) {
    for (let v = start; v <= end + 1e-9; v += step) {
      out.push(Number(v.toFixed(9)));
    }
  } else {
    for (let v = start; v >= end - 1e-9; v += step) {
      out.push(Number(v.toFixed(9)));
    }
  }
  return out;
};

const parseListOrRange = (value: string): number[] => {
  const fromRange = parseRange(value);
  if (fromRange && fromRange.length) return fromRange;
  return parseNumberList(value);
};

interface DynamicControlsProps {
  form: UseFormReturn<SimulationParameters>;
  isVisible: boolean;
}

export function DynamicControls({ form, isVisible }: DynamicControlsProps) {
  if (!isVisible) return null;
  const { publishSweepControls, data: pipeline } = useEnergyPipeline({
    refetchInterval: 0,
    refetchOnWindowFocus: false,
    staleTime: 5_000,
  });
  const mechanical = (pipeline as any)?.mechanical as any;
  const maxStrokeGuard = mechanical && Number.isFinite(mechanical?.maxStroke_pm)
    ? Number(mechanical.maxStroke_pm)
    : undefined;

  return (
    <Card className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-blue-200 dark:border-blue-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-900 dark:text-blue-100">
          <Activity className="h-5 w-5" />
          Dynamic Casimir Effects Configuration
        </CardTitle>
        <CardDescription className="text-blue-700 dark:text-blue-300">
          Configure moving boundary parameters following math-gpt.org formulation with quantum inequality constraints
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Time Domain Parameters */}
        <div className="space-y-4">
          <h4 className="font-medium text-blue-900 dark:text-blue-100 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Time Domain Modulation
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="dynamicConfig.modulationFreqGHz"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">Modulation Frequency (fₘ)</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input 
                        type="text" 
                        step="0.1" 
                        placeholder="15" 
                        {...field}
                        value={field.value || ""}
                        onChange={(e) => {
                          const raw = e.target.value; 
                          const parsed = raw === "" ? undefined : Number(raw); 
                          const guard = Number.isFinite(maxStrokeGuard) ? (maxStrokeGuard as number) : undefined; 
                          if (typeof parsed !== "number" || !Number.isFinite(parsed)) { 
                            field.onChange(raw); 
                            return; 
                          } 
                          const next = guard != null && parsed > guard ? guard : parsed; 
                          field.onChange(next); 
                        }} 
                        className="pr-12"
                      />
                    </FormControl>
                    <span className="absolute right-3 top-2 text-sm text-muted-foreground">GHz</span>
                  </div>
                  <FormDescription className="text-xs">Stroke frequency (0.1-100 GHz)</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dynamicConfig.strokeAmplitudePm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">Stroke Amplitude (δa)</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input 
                        type="text" 
                        step="0.1" 
                        placeholder="50" 
                        {...field}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value)}
                        className="pr-12"
                      />
                    </FormControl>
                    <span className="absolute right-3 top-2 text-sm text-muted-foreground">pm</span>
                  </div>
                  <FormDescription className="text-xs">
                    Peak displacement amplitude (+/-0.1-1000 pm)
                    {maxStrokeGuard != null
                      ? ` mechanical guard <= ${maxStrokeGuard.toFixed(1)} pm`
                      : ""}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Duty Cycle Parameters */}
        <div className="space-y-4">
          <h4 className="font-medium text-blue-900 dark:text-blue-100 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Duty Cycle Control
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="dynamicConfig.burstLengthUs"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">Burst Length (t_burst)</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input 
                        type="text" 
                        step="0.1" 
                        placeholder="10" 
                        {...field}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value)}
                        className="pr-12"
                      />
                    </FormControl>
                    <span className="absolute right-3 top-2 text-sm text-muted-foreground">μs</span>
                  </div>
                  <FormDescription className="text-xs">Active modulation period (0.1-1000 μs)</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dynamicConfig.cycleLengthUs"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">Cycle Time (t_cycle)</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input 
                        type="text" 
                        step="1" 
                        placeholder="1000" 
                        {...field}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value)}
                        className="pr-12"
                      />
                    </FormControl>
                    <span className="absolute right-3 top-2 text-sm text-muted-foreground">μs</span>
                  </div>
                  <FormDescription className="text-xs">Total cycle period (1-10000 μs)</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Cavity Enhancement */}
        <div className="space-y-4">
          <h4 className="font-medium text-blue-900 dark:text-blue-100 flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Cavity Enhancement
          </h4>
          
          <FormField
            control={form.control}
            name="dynamicConfig.cavityQ"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm">Quality Factor (Q)</FormLabel>
                <div className="relative">
                  <FormControl>
                    <Input 
                      type="text" 
                      step="1000000" 
                      placeholder="1000000000" 
                      {...field}
                      value={field.value || ""}
                      onChange={(e) => field.onChange(e.target.value)}
                      className="pr-12"
                    />
                  </FormControl>
                  <span className="absolute right-3 top-2 text-sm text-muted-foreground">—</span>
                </div>
                <FormDescription className="text-xs">
                  Cavity quality factor for energy enhancement (10³-10¹² range)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* DCE Pump Sweep */}
        <div className="space-y-4">
          <h4 className="font-medium text-blue-900 dark:text-blue-100 flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Pump Sweep Controls
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="dynamicConfig.mod_depth_pct"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">Modulation Depth (%)</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="0.1,0.2,0.5 or 0.1:2:0.1"
                      {...field}
                      value={Array.isArray(field.value) ? field.value.join(", ") : field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value)}
                      onBlur={(e) => {
                        const list = parseListOrRange(e.target.value);
                        if (list.length) {
                          publishSweepControls({ mod_depth_pct: list });
                        }
                      }}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Comma list or start:stop:step (e.g. 0.1:2:0.1)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dynamicConfig.pump_freq_GHz"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">Pump Frequency (GHz)</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="auto or 29.8,30.1 or 25:35:0.5"
                      {...field}
                      value={Array.isArray(field.value) ? field.value.join(", ") : field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value)}
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        if (!raw) return;
                        if (raw.toLowerCase() === "auto") {
                          publishSweepControls({ pump_freq_GHz: "auto" as any });
                          return;
                        }
                        const list = parseListOrRange(raw);
                        if (list.length) {
                          publishSweepControls({ pump_freq_GHz: list });
                        }
                      }}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Comma list, range, or <code>auto</code> to center at 2*f<sub>0</sub>
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dynamicConfig.phase_deg"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">Pump Phase Bias (deg)</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="-10:10:1 or -2,0,2"
                      {...field}
                      value={Array.isArray(field.value) ? field.value.join(", ") : field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value)}
                      onBlur={(e) => {
                        const list = parseListOrRange(e.target.value);
                        if (list.length) {
                          publishSweepControls({ phase_deg: list });
                        }
                      }}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Specify exploration phases (list or range)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                publishSweepControls({
                  sweep: {
                    ...DEFAULT_GEOMETRY_SWEEP,
                    gaps_nm: [...DEFAULT_GEOMETRY_SWEEP.gaps_nm],
                    mod_depth_pct: DEFAULT_GEOMETRY_SWEEP.mod_depth_pct
                      ? [...DEFAULT_GEOMETRY_SWEEP.mod_depth_pct]
                      : [],
                    pump_freq_GHz:
                      typeof DEFAULT_GEOMETRY_SWEEP.pump_freq_GHz === "string"
                        ? DEFAULT_GEOMETRY_SWEEP.pump_freq_GHz
                        : DEFAULT_GEOMETRY_SWEEP.pump_freq_GHz
                        ? [...DEFAULT_GEOMETRY_SWEEP.pump_freq_GHz]
                        : [],
                    phase_deg: DEFAULT_GEOMETRY_SWEEP.phase_deg
                      ? [...DEFAULT_GEOMETRY_SWEEP.phase_deg]
                      : [],
                    plateau: DEFAULT_GEOMETRY_SWEEP.plateau
                      ? { ...DEFAULT_GEOMETRY_SWEEP.plateau }
                      : undefined,
                    phaseMicroStep_deg: DEFAULT_GEOMETRY_SWEEP.phaseMicroStep_deg,
                  },
                })
              }
            >
              Load Geometry Sweep (20-400 nm)
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                publishSweepControls({
                  sweep: {
                    phase_deg: [...(DEFAULT_PHASE_MICRO_SWEEP.phase_deg ?? [])],
                    phaseMicroStep_deg: DEFAULT_PHASE_MICRO_SWEEP.phaseMicroStep_deg,
                  } as any,
                })
              }
            >
              Load Phase Micro Sweep (+/-2 deg, 0.25 deg)
            </Button>
          </div>
        </div>

        {/* Physics Preview */}
        <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
          <h5 className="font-medium text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Physics Preview
          </h5>
          <div className="grid grid-cols-2 gap-4 text-xs text-blue-700 dark:text-blue-300">
            <div>
              <span className="font-medium">Stroke Period:</span>
              <div className="font-mono">
                {form.watch("dynamicConfig.modulationFreqGHz") 
                  ? `${(1000 / form.watch("dynamicConfig.modulationFreqGHz")).toFixed(1)} ps`
                  : "—"}
              </div>
            </div>
            <div>
              <span className="font-medium">Duty Factor:</span>
              <div className="font-mono">
                {form.watch("dynamicConfig.burstLengthUs") && form.watch("dynamicConfig.cycleLengthUs")
                  ? `${((form.watch("dynamicConfig.burstLengthUs") / form.watch("dynamicConfig.cycleLengthUs")) * 100).toFixed(1)}%`
                  : "—"}
              </div>
            </div>
            <div>
              <span className="font-medium">Rep Rate:</span>
              <div className="font-mono">
                {form.watch("dynamicConfig.cycleLengthUs") 
                  ? `${(1000 / form.watch("dynamicConfig.cycleLengthUs")).toFixed(1)} kHz`
                  : "—"}
              </div>
            </div>
            <div>
              <span className="font-medium">Q Factor:</span>
              <div className="font-mono">
                {form.watch("dynamicConfig.cavityQ") 
                  ? form.watch("dynamicConfig.cavityQ").toExponential(1)
                  : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Sector Strobing Controls for Needle Hull */}
        <div className="p-4 border border-purple-200 rounded-lg bg-purple-50/50">
          <h4 className="text-sm font-medium mb-3 text-purple-800">Sector Strobing (Needle Hull)</h4>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="dynamicConfig.sectorCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Sector Count</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input 
                        type="text" 
                        step="1" 
                        min="1"
                        max="1000"
                        placeholder="400" 
                        {...field}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                        className="text-xs h-8"
                      />
                    </FormControl>
                  </div>
                  <FormDescription className="text-xs">Azimuthal sectors for strobing</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dynamicConfig.sectorDuty"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Ship-wide Duty</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input 
                        type="text" 
                        step="1e-6" 
                        min="1e-6"
                        max="1"
                        placeholder="2.5e-5" 
                        {...field}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value)}
                        className="text-xs h-8"
                      />
                    </FormControl>
                  </div>
                  <FormDescription className="text-xs">d_eff = d/S factor</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

              <FormField
                control={form.control}
                name="dynamicConfig.lightCrossingTimeNs"
                render={({ field }) => (
                  <FormItem>
                   <FormLabel className="text-xs">Light-Crossing Payload (Legacy)</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input 
                        type="text" 
                        step="1" 
                        min="1"
                        max="1000"
                        placeholder="100" 
                        {...field}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value)}
                        className="text-xs h-8 pr-8"
                      />
                    </FormControl>
                    <span className="absolute right-2 top-1 text-xs text-muted-foreground">ns</span>
                  </div>
                    <FormDescription className="text-xs">Compatibility field in ns; authoritative τ_LC is derived from hull/clocking in ms.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Safety Information */}
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border border-amber-200 dark:border-amber-700">
          <h5 className="font-medium text-amber-900 dark:text-amber-100 mb-1 flex items-center gap-2">
            <Power className="h-4 w-4" />
            Quantum Safety & GR Validity
          </h5>
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Simulation includes quantum inequality monitoring, GR validity checks via sector strobing, 
            and Natário metric stress-energy tensor calculations for warp bubble conditions.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}




