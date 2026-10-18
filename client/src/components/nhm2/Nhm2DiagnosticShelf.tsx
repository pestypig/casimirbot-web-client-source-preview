import { Component, lazy, Suspense, useState, type ComponentType, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CavitySweepDiagnosticCard = lazy(() => import("./CavitySweepDiagnosticCard"));
const MassProvenanceDiagnosticCard = lazy(() => import("./MassProvenanceDiagnosticCard"));
const CollapseBenchmarkDiagnosticCard = lazy(() => import("./CollapseBenchmarkDiagnosticCard"));
const SpectrumIngestDiagnosticCard = lazy(() => import("./SpectrumIngestDiagnosticCard"));
const VacuumSweepDeveloperCard = lazy(() => import("./VacuumSweepDeveloperCard"));
const HullDeveloperToolsCard = lazy(() => import("./HullDeveloperToolsCard"));
const ModelSilhouettePanel = lazy(() => import("@/components/ModelSilhouettePanel"));
const DriveSyncDeveloperCard = lazy(() => import("./DriveSyncDeveloperCard"));
const CasimirTileDeveloperCard = lazy(() => import("./CasimirTileDeveloperCard"));
const GeometrySourceDeveloperCard = lazy(() => import("./GeometrySourceDeveloperCard"));
const TimeDilationActivationDeveloperCard = lazy(() => import("./TimeDilationActivationDeveloperCard"));
const VacuumSweepVisualizationCard = lazy(() => import("./VacuumSweepVisualizationCard"));
const DisplacementFieldDiagnosticCard = lazy(() => import("./DisplacementFieldDiagnosticCard"));
const BusPipelineDiagnosticCard = lazy(() => import("./BusPipelineDiagnosticCard"));
const SectorStateDeveloperCard = lazy(() => import("./SectorStateDeveloperCard"));
const EnergyFluxPanel = lazy(() => import("@/components/EnergyFluxPanel"));
const FractionalCoherenceGrid = lazy(() => import("@/components/FractionalCoherenceGrid"));
const HullMetricsVisPanel = lazy(() => import("@/components/HullMetricsVisPanel"));
const ShiftVectorPanel = lazy(() => import("@/components/ShiftVectorPanel").then((module) => ({ default: module.ShiftVectorPanel })));
const NeedleIpeakWorksheetPanel = lazy(() => import("@/components/NeedleIpeakWorksheetPanel"));
const VizDiagnosticsPanel = lazy(() => import("@/components/warp/VizDiagnosticsPanel"));

function NeedleIpeakDiagnosticView() {
  return (
    <div className="h-[48rem] w-full min-w-[52rem]">
      <NeedleIpeakWorksheetPanel />
    </div>
  );
}

// These panels show live mechanism or visual proxies. They do not contribute
// selected-run evidence to the canonical NHM2 solve state above this shelf.
const DIAGNOSTICS = [
  { id: "hull-developer-tools", title: "Hull developer tools", scope: "Model Silhouette preview, GLB measurement, local hull library, and explicit live-pipeline update; no selected-run NHM2 binding" },
  { id: "model-silhouette-editor", title: "Model Silhouette editor", scope: "On-demand GLB upload, basis, scale, fit, mesh preview, and local preview publication; no selected-run NHM2 binding" },
  { id: "drive-sync-developer", title: "Drive sync developer controls", scope: "Explicit local phase, split, sector-shape, and visual-amplitude controls; no selected-run NHM2 binding" },
  { id: "casimir-tile-developer", title: "Casimir tile developer controls", scope: "Explicit live-pipeline schedule, tile-area, and amplification edits with a live summary; no selected-run NHM2 binding" },
  { id: "geometry-source-developer", title: "Geometry source developer controls", scope: "Explicit ellipsoid or repository/upload GLB pipeline update with preview provenance; no selected-run NHM2 binding" },
  { id: "time-dilation-activation", title: "Natario diagnostic activation", scope: "Explicit live-pipeline activation request and server diagnostics read/export; request acceptance is not metric or NHM2 proof" },
  { id: "vacuum-sweep-visualization", title: "Vacuum sweep visualization", scope: "Retained live sweep rows, heatmap, and replay; no selected-run NHM2 receipt" },
  { id: "displacement-field-diagnostic", title: "Displacement field diagnostic", scope: "On-demand live ellipsoidal-shell proxy sampling; no selected-run tensor or metric proof" },
  { id: "mass-provenance-evidence", title: "Mass provenance evidence", scope: "Live pipeline dataset, fit, uncertainty, and override; no selected-run binding" },
  { id: "cavity-sweep-evidence", title: "Cavity sweep evidence", scope: "Live cavity, material-receipt field, and sweep guards; no selected-run binding" },
  { id: "collapse-benchmark-diagnostic", title: "Collapse benchmark diagnostic", scope: "Live lattice computation; server receipt or local fallback, not selected-run NHM2 proof" },
  { id: "spectrum-ingest-diagnostic", title: "Spectrum hardware feed", scope: "Developer VNA connection and ingest; no authenticated selected-run measurement receipt" },
  { id: "vacuum-sweep-operations", title: "Vacuum-gap sweep operations", scope: "Developer sweep hardware ingest, status, and cancellation; no selected-run receipt" },
  { id: "viz-diagnostics", title: "Renderer and pipeline diagnostics", scope: "Visual gain and live pipeline telemetry; no selected-run NHM2 binding" },
  { id: "energy-flux", title: "Stress brick spatial diagnostic", scope: "Live stress-brick slices, point probe, and raw feed fields; no selected-run NHM2 binding" },
  { id: "bus-pipeline", title: "Bus pipeline calculation", scope: "Mode-policy voltage and derived current; no instrument reading or hardware-ready receipt" },
  { id: "fractional-coherence-diagnostic", title: "Fractional coherence diagnostic", scope: "On-demand client DSP of drive samples with an explicit synthetic fallback; no selected-run NHM2 or QEI receipt" },
  { id: "hull-metrics-vis", title: "Hull metrics visualization", scope: "Hull and field-geometry viewer; on-demand geometry sampling is diagnostic" },
  { id: "shift-vector", title: "Shift-vector visualization", scope: "Pipeline or fallback tilt proxy; mounting publishes Hull3D visualization events and updates shared sector geometry" },
  { id: "sector-state-hardware", title: "Sector-state hardware feed", scope: "Developer controller ingest and opt-in local sector-bus relay; no selected-run NHM2 binding" },
  { id: "needle-ipeak-worksheet", title: "Needle I_peak worksheet", scope: "Legacy Mk.1 CSV import, estimate, and export. Loads only submitted rows; the optional repo example is provisional engineering data, not selected-run NHM2 evidence" },
] as const;

type DiagnosticId = (typeof DIAGNOSTICS)[number]["id"];

const CUSTOM_DIAGNOSTICS: Record<DiagnosticId, ComponentType<any>> = {
  "cavity-sweep-evidence": CavitySweepDiagnosticCard,
  "mass-provenance-evidence": MassProvenanceDiagnosticCard,
  "collapse-benchmark-diagnostic": CollapseBenchmarkDiagnosticCard,
  "spectrum-ingest-diagnostic": SpectrumIngestDiagnosticCard,
  "vacuum-sweep-operations": VacuumSweepDeveloperCard,
  "hull-developer-tools": HullDeveloperToolsCard,
  "model-silhouette-editor": ModelSilhouettePanel,
  "drive-sync-developer": DriveSyncDeveloperCard,
  "casimir-tile-developer": CasimirTileDeveloperCard,
  "geometry-source-developer": GeometrySourceDeveloperCard,
  "time-dilation-activation": TimeDilationActivationDeveloperCard,
  "vacuum-sweep-visualization": VacuumSweepVisualizationCard,
  "displacement-field-diagnostic": DisplacementFieldDiagnosticCard,
  "bus-pipeline": BusPipelineDiagnosticCard,
  "sector-state-hardware": SectorStateDeveloperCard,
  "energy-flux": EnergyFluxPanel,
  "fractional-coherence-diagnostic": FractionalCoherenceGrid,
  "hull-metrics-vis": HullMetricsVisPanel,
  "shift-vector": ShiftVectorPanel,
  "needle-ipeak-worksheet": NeedleIpeakDiagnosticView,
  "viz-diagnostics": VizDiagnosticsPanel,
} as const;

class DiagnosticBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { message: error.message };
  }

  render() {
    if (this.state.message) {
      return <p className="text-sm text-amber-200">This diagnostic could not render: {this.state.message}</p>;
    }
    return this.props.children;
  }
}

export default function Nhm2DiagnosticShelf() {
  const [selectedId, setSelectedId] = useState<DiagnosticId>("energy-flux");
  const selected = DIAGNOSTICS.find((item) => item.id === selectedId)!;
  const Diagnostic = CUSTOM_DIAGNOSTICS[selectedId];
  const diagnosticProps = selectedId === "hull-developer-tools"
    ? { onOpenEditor: () => setSelectedId("model-silhouette-editor") }
    : {};

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
        Live mechanism telemetry and visual proxies. Some views publish local visualization or telemetry events
        while mounted; they may use defaults or a different live pipeline snapshot. Their values do not amend
        the selected NHM2 campaign, prove source closure, or authorize
        physical, speed, transport, or route claims.
      </div>
      <div className="max-w-md space-y-1">
        <Label htmlFor="nhm2-diagnostic-select" className="text-xs text-slate-300">Diagnostic view</Label>
        <Select value={selectedId} onValueChange={(value) => setSelectedId(value as DiagnosticId)}>
          <SelectTrigger id="nhm2-diagnostic-select" className="border-slate-700 bg-slate-950 text-slate-100">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 text-slate-100">
            {DIAGNOSTICS.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-400">{selected.scope}</p>
      </div>
      <div className="min-h-[22rem] overflow-auto rounded-lg border border-slate-800 bg-slate-950/60 p-3">
        <DiagnosticBoundary key={selectedId}>
          <Suspense fallback={<p className="text-sm text-slate-400">Loading diagnostic…</p>}>
            <Diagnostic {...diagnosticProps} />
          </Suspense>
        </DiagnosticBoundary>
      </div>
    </div>
  );
}
