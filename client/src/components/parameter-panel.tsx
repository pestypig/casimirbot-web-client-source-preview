import { useEffect, useState, startTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, Sliders, Play, FileCode, Cpu, Zap, Activity, Rocket } from "lucide-react";
import { DynamicControls } from "./dynamic-controls";
import { NeedleHullPreset } from "./needle-hull-preset";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { simulationParametersSchema, SimulationParameters, type DynamicConfig } from "@shared/schema";
import { buildNeedleHullMark2SimulationParameters } from "@shared/needle-hull-mark2-cavity-contract";
import { useEnergyPipeline } from "@/hooks/use-energy-pipeline";

interface ParameterPanelProps {
  onSubmit: (parameters: SimulationParameters) => void;
  onGenerateOnly: (parameters: SimulationParameters) => void;
  isLoading: boolean;
  // Phase diagram state
  onTileAreaChange?: (value: number) => void;
  onHullReferenceRadiusChange?: (value: number) => void;
  // Apply preset callback
  onApplyPreset?: () => void;
  // Dynamic parameter values for preset application
  parameterValues?: {
    gammaGeo: number;
    qFactor: number;
    duty: number;
    sagDepth: number;
    temperature: number;
    strokeAmplitude: number;
    burstTime: number;
    cycleTime: number;
    xiPoints: number;
  };
  // Dynamic parameter setters for preset application
  onParameterChange?: {
    setGammaGeo: (value: number) => void;
    setQFactor: (value: number) => void;
    setDuty: (value: number) => void;
    setSagDepth: (value: number) => void;
    setTemperature: (value: number) => void;
    setStrokeAmplitude: (value: number) => void;
    setBurstTime: (value: number) => void;
    setCycleTime: (value: number) => void;
    setXiPoints: (value: number) => void;
  };
}

export default function ParameterPanel({ 
  onSubmit, 
  onGenerateOnly, 
  isLoading, 
  onTileAreaChange, 
  onHullReferenceRadiusChange,
  onApplyPreset,
  parameterValues,
  onParameterChange
}: ParameterPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { publishSweepControls, data: pipeline } = useEnergyPipeline({
    refetchInterval: 0,
    refetchOnWindowFocus: false,
    staleTime: 5_000,
  });
  const mechanical = (pipeline as any)?.mechanical as any;
  const minGapGuard = mechanical && Number.isFinite(mechanical?.recommendedGap_nm)
    ? Number(mechanical.recommendedGap_nm)
    : mechanical && Number.isFinite(mechanical?.minGap_nm)
      ? Number(mechanical.minGap_nm)
      : undefined;
  const [gapGuardNote, setGapGuardNote] = useState<string | null>(null);

  const form = useForm<SimulationParameters>({
    resolver: zodResolver(simulationParametersSchema),
    defaultValues: buildNeedleHullMark2SimulationParameters(),
  });

  useEffect(() => {
    if (!onParameterChange) {
      return;
    }

    const syncParameterState = (values: SimulationParameters) => {
      const dynamicConfig = values.dynamicConfig;
      const advanced = values.advanced;

      if (typeof values.sagDepth === "number") {
        onParameterChange.setSagDepth(values.sagDepth);
      }

      if (typeof values.temperature === "number") {
        onParameterChange.setTemperature(values.temperature);
      }

      if (typeof dynamicConfig?.cavityQ === "number") {
        onParameterChange.setQFactor(dynamicConfig.cavityQ);
      }

      if (typeof dynamicConfig?.sectorDuty === "number") {
        onParameterChange.setDuty(dynamicConfig.sectorDuty);
      }

      if (typeof dynamicConfig?.strokeAmplitudePm === "number") {
        onParameterChange.setStrokeAmplitude(dynamicConfig.strokeAmplitudePm);
      }

      if (typeof dynamicConfig?.burstLengthUs === "number") {
        onParameterChange.setBurstTime(dynamicConfig.burstLengthUs);
      }

      if (typeof dynamicConfig?.cycleLengthUs === "number") {
        onParameterChange.setCycleTime(dynamicConfig.cycleLengthUs);
      }

      if (typeof advanced?.maxXiPoints === "number") {
        onParameterChange.setXiPoints(advanced.maxXiPoints);
      }
    };

    syncParameterState(form.getValues());
    const subscription = form.watch((values) => {
      syncParameterState(values as SimulationParameters);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [form, onParameterChange]);

  const handleSubmit = (data: SimulationParameters) => {
    onSubmit(data);
  };

  const handleGenerateOnly = () => {
    const data = form.getValues();
    onGenerateOnly(data);
  };

  const [gapSweepInput, setGapSweepInput] = useState(() => {
    const initial = form.getValues().dynamicConfig?.gap_nm;
    if (Array.isArray(initial)) return initial.join(",");
    if (typeof initial === "number") return String(initial);
    return "";
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sliders className="h-5 w-5 text-primary" />
          Simulation Parameters
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">

            {/* Geometry Selection */}
            <FormField
              control={form.control}
              name="geometry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Geometry Type</FormLabel>
                  <FormControl>
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="space-y-3">
                      <div className="flex items-center space-x-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                        <RadioGroupItem value="sphere" id="sphere" />
                        <div className="flex-1">
                          <Label htmlFor="sphere" className="font-medium cursor-pointer">Sphere</Label>
                          <p className="text-sm text-muted-foreground">Sphere above a plate</p>
                        </div>
                        <div className="w-4 h-4 rounded-full bg-slate-300"></div>
                      </div>

                      <div className="flex items-center space-x-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                        <RadioGroupItem value="parallel_plate" id="parallel_plate" />
                        <div className="flex-1">
                          <Label htmlFor="parallel_plate" className="font-medium cursor-pointer">Parallel Plate</Label>
                          <p className="text-sm text-muted-foreground">Two parallel flat disks</p>
                        </div>
                        <div className="flex space-x-1">
                          <div className="w-4 h-1 bg-slate-300"></div>
                          <div className="w-4 h-1 bg-slate-300"></div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                        <RadioGroupItem value="bowl" id="bowl" />
                        <div className="flex-1">
                          <Label htmlFor="bowl" className="font-medium cursor-pointer">Bowl</Label>
                          <p className="text-sm text-muted-foreground">Concave bowl with flat piston</p>
                        </div>
                        <div className="w-4 h-4 rounded-t-full bg-slate-300"></div>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Module Type Selection */}
            <FormField
              control={form.control}
              name="moduleType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Physics Module</FormLabel>
                  <FormControl>
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="space-y-3">
                      <div className="flex items-center space-x-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                        <RadioGroupItem value="static" id="static" />
                        <div className="flex-1">
                          <Label htmlFor="static" className="font-medium cursor-pointer flex items-center gap-2">
                            <Cpu className="h-4 w-4" />
                            Static Casimir
                          </Label>
                          <p className="text-sm text-muted-foreground">Standard SCUFF-EM calculations</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                        <RadioGroupItem value="dynamic" id="dynamic" />
                        <div className="flex-1">
                          <Label htmlFor="dynamic" className="font-medium cursor-pointer flex items-center gap-2">
                            <Zap className="h-4 w-4" />
                            Dynamic Casimir
                          </Label>
                          <p className="text-sm text-muted-foreground">Moving boundaries with quantum inequality constraints</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 p-3 border border-purple-200 rounded-lg hover:bg-purple-50 transition-colors">
                        <RadioGroupItem value="warp" id="warp" />
                        <div className="flex-1">
                          <Label htmlFor="warp" className="font-medium cursor-pointer flex items-center gap-2">
                            <Rocket className="h-4 w-4 text-purple-600" />
                            Natário Warp Bubble
                          </Label>
                          <p className="text-sm text-muted-foreground">Zero-expansion warp metrics with exotic mass calculations</p>
                        </div>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Needle Hull Preset Button (single source of truth) */}
            <NeedleHullPreset 
              form={form} 
              onTileAreaChange={onTileAreaChange}
              onHullReferenceRadiusChange={onHullReferenceRadiusChange}
              onApplyPreset={onApplyPreset}
            />

            {/* Dynamic Module Controls */}
            <DynamicControls form={form} isVisible={form.watch("moduleType") === "dynamic"} />

            {/* Numerical Parameters */}
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="gap"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gap Distance</FormLabel>
                    <div className="relative">
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.1" 
                        placeholder="1.0" 
                        {...field}
                        value={field.value || ""}
                        min={minGapGuard ?? 0.1}
                        onChange={(e) => {
                          const raw = e.target.value ? parseFloat(e.target.value) : undefined;
                          const guard = Number.isFinite(minGapGuard) ? (minGapGuard as number) : undefined;
                          if (raw == null || Number.isNaN(raw)) {
                            field.onChange(undefined);
                            setGapGuardNote(null);
                            return;
                          }
                          const next = guard != null && raw < guard ? guard : raw;
                          if (guard != null && raw < guard) {
                            setGapGuardNote(`Clamped to mechanical floor of ${guard.toFixed(2)} nm`);
                          } else {
                            setGapGuardNote(null);
                          }
                          field.onChange(next);
                        }}
                        className="pr-12"
                      />
                    </FormControl>
                    <span className="absolute right-3 top-2 text-sm text-muted-foreground">nm</span>
                  </div>
                  <FormDescription>
                    {minGapGuard != null
                      ? `Distance between objects (guarded >= ${minGapGuard.toFixed(2)} nm to avoid stiction)`
                      : "Distance between objects"}
                  </FormDescription>
                  {gapGuardNote && (
                    <p className="text-[11px] text-amber-500">{gapGuardNote}</p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

              <FormItem>
                <FormLabel>Vacuum Gap Sweep (nm)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g., 60,80,100,120"
                    value={gapSweepInput}
                    onChange={(e) => setGapSweepInput(e.target.value)}
                    onBlur={() => {
                      const raw = gapSweepInput.trim();
                      const guard = Number.isFinite(minGapGuard) ? (minGapGuard as number) : undefined;
                      const applyGuard = (value: number) =>
                        guard != null ? Math.max(value, guard) : value;
                      if (!raw) {
                        form.setValue("dynamicConfig.gap_nm", undefined);
                        return;
                      }
                      if (raw.includes(",")) {
                        const gaps = raw
                          .split(",")
                          .map((s) => Number(s.trim()))
                          .filter((x) => Number.isFinite(x) && x > 0);
                        if (gaps.length) {
                          const guarded = gaps.map(applyGuard);
                          const clamped = guarded.some((g, idx) => g !== gaps[idx]);
                          form.setValue("dynamicConfig.gap_nm", guarded);
                          publishSweepControls({ sweep: { gaps_nm: guarded } as DynamicConfig["sweep"] });
                          setGapSweepInput(guarded.join(","));
                          setGapGuardNote(
                            clamped && guard != null
                              ? `Gaps were clamped to >= ${guard.toFixed(2)} nm mechanical floor`
                              : null,
                          );
                        }
                      } else {
                        const value = Number(raw);
                        if (Number.isFinite(value) && value > 0) {
                          const guarded = applyGuard(value);
                          form.setValue("dynamicConfig.gap_nm", guarded);
                          publishSweepControls({ gap_nm: guarded });
                          setGapSweepInput(String(guarded));
                          setGapGuardNote(
                            guard != null && guarded !== value
                              ? `Gap was clamped to ${guard.toFixed(2)} nm mechanical floor`
                              : null,
                          );
                        }
                      }
                    }}
                  />
                </FormControl>
                <FormDescription>Comma-separated nanometer gaps for backend sweep</FormDescription>
              </FormItem>

              <FormField
                control={form.control}
                name="radius"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Radius</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input 
                          type="number" 
                          step="1" 
                          placeholder="25000" 
                          {...field}
                          value={field.value || ""}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                          className="pr-12"
                        />
                      </FormControl>
                      <span className="absolute right-3 top-2 text-sm text-muted-foreground">µm</span>
                    </div>
                    <FormDescription>Object characteristic size</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="material"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Material</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select material" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="PEC">PEC (Perfect Electric Conductor)</SelectItem>
                        <SelectItem value="custom">Custom Material</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Sag Depth Field (only for bowl geometry) */}
              {form.watch("geometry") === "bowl" && (
                <FormField
                  control={form.control}
                  name="sagDepth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sag Depth</FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Input 
                            type="number" 
                            step="1" 
                            placeholder="100.0" 
                            {...field}
                            value={field.value || ""}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            className="pr-12"
                          />
                        </FormControl>
                        <span className="absolute right-3 top-2 text-sm text-muted-foreground">nm</span>
                      </div>
                      <FormDescription>Concave depth of the spherical cap (25 mm radius)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="temperature"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Temperature</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.1" 
                          placeholder="20" 
                          {...field}
                          value={field.value || ""}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                          className="pr-12"
                        />
                      </FormControl>
                      <span className="absolute right-3 top-2 text-sm text-muted-foreground">K</span>
                    </div>
                    <FormDescription>Simulation temperature (default: 20 K)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Advanced Parameters */}
            <div className="pt-6 border-t border-slate-200">
              <Collapsible open={showAdvanced} onOpenChange={(open) => {
                startTransition(() => {
                  setShowAdvanced(open);
                });
              }}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="flex items-center justify-between w-full p-0 h-auto">
                    <span className="text-sm font-medium">Advanced Parameters</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="advanced.xiMin"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Xi Min</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              step="0.001" 
                              placeholder="0.001" 
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value))}
                              className="text-sm"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="advanced.maxXiPoints"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Max Xi Points</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              placeholder="10000" 
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                              className="text-sm"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="advanced.intervals"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Intervals</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              placeholder="50" 
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                              className="text-sm"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="advanced.relTol"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Rel Tol</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              step="0.01" 
                              placeholder="0.01" 
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value))}
                              className="text-sm"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading}
              >
                <Play className="w-4 h-4 mr-2" />
                Generate & Run Simulation
              </Button>

              <Button 
                type="button" 
                variant="secondary" 
                className="w-full"
                onClick={handleGenerateOnly}
                disabled={isLoading}
              >
                <FileCode className="w-4 h-4 mr-2" />
                Generate .scuffgeo Only
              </Button>
            </div>
          </form>
        </Form>

        {/* Example Panel */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-2">
            <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center mt-0.5">
              <span className="text-white text-xs">i</span>
            </div>
            <div>
              <h3 className="text-sm font-medium text-blue-800 mb-2">Example Usage</h3>
              <div className="text-xs text-blue-700 font-mono bg-blue-100 p-2 rounded">
                Geometry: parallel_plate<br />
                Gap: 1.0 nm<br />
                Radius: 25000 µm<br />
                Temperature: 20 K
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
