import React, { useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useMutation } from "@tanstack/react-query";
import { SolarDiskCanvas, DiskGeom, DiskEventGlyph } from "@/components/SolarDiskCanvas";
import { SolarKhiNativeOverlay } from "@/components/SolarKhiNativeOverlay";
import { sunpyMaxFramesQuery, sunpyProbeAllowed } from "@/lib/sunpy-request";
import { SolarObservationRaster } from "@/components/SolarObservationRaster";
import {SolarSurfaceRegistrationViewer} from '@/components/solar/SolarSurfaceRegistrationViewer';
import { SolarEvidenceTimeline } from "@/components/SolarEvidenceTimeline";
import {SolarObservationFreshness} from '@/components/SolarObservationFreshness';
import {createSolarEventImageSelection, type SolarEventImageSelection} from '../../../shared/solar-event-image-selection';
import {createSolarGoesFrameWindow, type SolarGoesFrameWindow} from '../../../shared/solar-goes-frame-window';
import {SolarObservationProcessing} from '@/components/SolarObservationProcessing';
import {SolarEvidenceStatus} from '@/components/SolarEvidenceStatus';
import { SolarProfileComparison } from "@/components/SolarProfileComparison";
import { SolarResearchWorkbenchCatalog } from "@/components/SolarResearchWorkbenchCatalog";
import { SolarEventEvidenceInspector } from "@/components/SolarEventEvidenceInspector";
import { SolarCacheManager } from "@/components/SolarCacheManager";
import { SolarMagneticArchiveDirectory } from '@/components/SolarMagneticArchiveDirectory';
import { SolarActiveRegionCatalog } from '@/components/SolarActiveRegionCatalog';
import { SolarRegisteredRegionDisplay } from '@/components/SolarRegisteredRegionDisplay';
import { isRegisteredSolarRegionsReceipt, type RegisteredSolarRegionsReceipt } from '@/lib/solar-registered-regions';
import { fetchSolarWithTimeout as fetchWithTimeout } from "@/lib/solar-fetch";
import { readObservationReplayInput } from "@/lib/solar-observation-replay";
import { exportObservationSnapshot } from "@/lib/solar-observation-export";
import {createSolarObservationOwnership} from '@/lib/solar-observation-ownership';
import {createSolarObservationViewStore,useSolarObservationView} from '@/lib/solar-observation-view-store';
import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT} from '@/lib/workstation/accountCapabilityPolicy';
import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";
import { SOLAR_SPECIALIST_PANELS,SOLAR_SPECIALIST_SECTIONS } from "@/lib/workstation/solarSpecialistPanels";
import type {SolarObserverGeometry} from '@shared/solar-surface-registration';
import sunpyIconUrl from "../../../public/sunpy-icon.svg";

type Source = { url: string; name: string };
type Metrics = {
  coherence: number | null;
  phaseDispersion: number | null;
  bandPower: number | null;
  regime: "locked" | "mixed" | "turbulent" | "warming_up";
  phaseReady: boolean;
  bandReady: boolean;
  historyBins: number;
  historyRequired: number;
  historyAvailable: boolean;
};

type StarTelemetry = {
  session_id?: string;
  session_type?: string;
  global_coherence?: number;
  phase_dispersion?: number;
  resonance_score?: number;
  p_mode_driver?: number;
  driver_history_len?: number;
  driver_history_required?: number;
  phase_dispersion_ready?: boolean;
  p_mode_ready?: boolean;
};

type OverlayField = "intensity" | "coherence" | "phaseDispersion" | "energy";
type SolarWorkbenchPage = "surface" | "imagery" | "sources" | "events" | "research" | "explore" | "diagnostics" | "reports";

const SOLAR_WORKBENCH_PAGES: Array<{ id: SolarWorkbenchPage; label: string; description: string }> = [
  { id: "surface", label: "Solar disk", description: "Current image and disk views" },
  { id: "imagery", label: "Imagery & sources", description: "Channels, acquisition and replay" },
  { id: "sources", label: "Data sources & access", description: "Archive directory, live feeds and researcher connections" },
  { id: "events", label: "Events", description: "HEK reports and selected regions" },
  { id: "research", label: "Research records", description: "Interior evidence and packages" },
  { id: "explore", label: "Models & concepts", description: "Specialist calculations and illustrations" },
  { id: "diagnostics", label: "Diagnostics", description: "Derived overlays and drivers" },
  { id: "reports", label: "Reports", description: "Copyable session summaries" },
];

type SdoLiveChannel = "aia193" | "aia171" | "hmiMag" | "hmiContinuum";
type SdoLivePreview = {
  schemaVersion: "solar-live-preview/2";
  channel: SdoLiveChannel;
  label: string;
  productKind: "browse_image";
  source: string;
  sourceId: "sdo" | "suvi-primary" | "suvi-secondary" | "helioviewer-hmi" | "helioviewer-hmi-mag";
  selectionReason: "preferred_fresh" | "preferred_stale" | "preferred_unavailable" | "no_fresh_compatible_source";
  instrument: "AIA" | "HMI" | "SUVI";
  wavelength_A: number | null;
  sourceUrl: string;
  imageUrl: string;
  sha256: string;
  retrievedAt: string;
  upstreamLastModifiedAt: string | null;
  observationAt: string | null;
  upstreamImageId: string | null;
  stale: boolean;
  scienceRunAllowed: false;
  quantitativeComparisonAllowed: false;
};

function expectedLiveSourceUrl(channel: SdoLiveChannel, sourceId: SdoLivePreview["sourceId"], upstreamImageId: string | null): string | null {
  if (sourceId === "helioviewer-hmi" || sourceId === "helioviewer-hmi-mag") {
    if (channel !== (sourceId === "helioviewer-hmi" ? "hmiContinuum" : "hmiMag") ||
        !upstreamImageId || !/^\d{1,20}$/.test(upstreamImageId)) return null;
    return `https://api.helioviewer.org/v2/downloadImage/?id=${upstreamImageId}&width=512&type=jpg`;
  }
  if (upstreamImageId !== null) return null;
  if (sourceId === "sdo") {
    const filename = {aia193:"latest_512_0193.jpg",aia171:"latest_512_0171.jpg",hmiMag:"latest_512_HMIB.jpg",hmiContinuum:"latest_512_HMII.jpg"}[channel];
    return `https://sdo.gsfc.nasa.gov/assets/img/latest/${filename}`;
  }
  if (channel === "hmiMag" || channel === "hmiContinuum" || (sourceId !== "suvi-primary" && sourceId !== "suvi-secondary")) return null;
  const wavelength = channel === "aia193" ? 195 : 171;
  const role = sourceId === "suvi-primary" ? "primary" : "secondary";
  return `https://services.swpc.noaa.gov/images/animations/suvi/${role}/${wavelength}/latest.png`;
}
type JsocConnectionStatus = {
  schemaVersion: "solar-jsoc-session-connection/1";
  connected: boolean;
  connectionId: string | null;
  maskedEmail: string | null;
  storage: "server_session_memory";
  verifiedAtProvider: false;
};

type SunFrame = {
  t: number;
  gridSize: number;
  mapSun: Float32Array; // co-rotated grid
  mapSunObserver: Float32Array; // observer-aligned grid (raw)
  rotationShiftPx?: number;
  diskGeom: DiskGeom;
};

type SolarOverlay = {
  frames: SunFrame[];
  map: {
    gridSize: number;
    coherence: Float32Array;
    phaseDispersion: Float32Array;
    energy: Float32Array;
  };
  caption?: string;
};

type SolarCoherenceResponse = {
  ok: boolean;
  caption?: string;
  global: { coherence: number; dispersion: number; energy: number };
  map: { gridSize: number; coherence_b64: string; phaseDispersion_b64: string; energy_b64: string };
  frames: Array<{
    t: number;
    gridSize: number;
    mapSun_b64: string;
    mapSunCorot_b64?: string;
    rotationShiftPx?: number;
    diskGeom: DiskGeom;
  }>;
  frameCount?: number;
};

type HekEventType = "FL" | "AR" | "CH" | "CE" | "CJ" | "EF" | "FI" | "FE" | string;

interface SunpyExportFrame {
  index: number;
  obstime: string;
  png_path?: string | null;
  fits_path?: string | null;
  grid_size?: number;
  map_b64?: string | null;
  display_processing?: string;
  display_normalization?: unknown;
  wcs_header?: Record<string,unknown>|null;
  registration_geometry?: SolarObserverGeometry|null;
}

interface SunpyExportEvent {
  id?: string;
  ivorn?: string;
  event_type: HekEventType;
  start_time?: string;
  end_time?: string;
  start?: string;
  end?: string;
  u?: number;
  v?: number;
  hgc_x?: number;
  hgc_y?: number;
  rho?: number;
  on_disk?: boolean;
  goes_class?: string;
  noaa_ar?: number;
  ch_area?: number;
  frm_name?: string;
  reference_urls?: string[];
  bbox?: Array<{ u: number; v: number }>;
  peak_flux?: number;
  grid_i?: number;
  grid_j?: number;
  grid_n?: number;
  grid_rsun_arcsec?: number;
}

interface SunpyExportDebug {
  reason?: string | null;
  frames?: number;
  map_b64_frames?: number;
  grid_sizes?: Array<number | string>;
  fallback?: string;
  timeout_ms?: number;
  error?: string;
  error_hint?: string;
  frames_missing?: boolean;
  frames_missing_reason?: string | null;
  fallback_attempted?: boolean;
  fallback_applied?: boolean;
  fallback_start?: string;
  fallback_end?: string;
}

interface SunpyCdawebBin {
  start?: string;
  end?: string;
  variance?: number;
  rms?: number;
  mean?: number;
  samples?: number;
  dbdt_rms?: number;
  anisotropy?: number;
}

interface SunpyCdawebBlock {
  dataset?: string;
  bins?: SunpyCdawebBin[];
  window_start?: string;
  window_end?: string;
  reason?: string | null;
}

interface SunpyGoesXrsPoint {
  time?: string;
  short?: number;
  long?: number;
}

interface SunpyGoesXrsBin {
  start?: string;
  end?: string;
  mean_short?: number;
  mean_long?: number;
  max_short?: number;
  max_long?: number;
}

interface SunpyGoesXrsBlock {
  points?: SunpyGoesXrsPoint[];
  bins?: SunpyGoesXrsBin[];
  reason?: string | null;
}

interface SunpyJsocCutout {
  file?: string;
  start?: string;
  end?: string;
  center_arcsec?: { x?: number; y?: number };
  width_arcsec?: number;
  height_arcsec?: number;
  reason?: string | null;
}

interface SunpySharpSummary {
  harpnum?: number;
  source?: string;
  segment?: string;
  map_path?: string;
  obstime?: string;
  mean_abs_flux?: number;
  total_abs_flux?: number;
  max_abs_flux?: number;
  pixels?: number;
}

interface SunpyExportPayload {
  archive_identity?: {snapshotId:string;processingRecipe:string};
  selected_event_context?: SolarEventImageSelection;
  selected_goes_window?: SolarGoesFrameWindow;
  instrument: string;
  wavelength_A: number;
  rsun_arcsec?: number;
  reason?: string | null;
  bridge?: SunpyBridgeSummary;
  debug?: SunpyExportDebug;
  meta?: {
    source?: string;
    fetched_at_utc?: string | null;
    start?: string;
    end?: string;
    instrument?: string;
    wavelength?: number;
    cadence_s?: number | null;
    max_frames?: number;
    requestedEventTypes?: string[];
    rsun_arcsec?: number;
    frames_missing?: boolean;
    frames_missing_reason?: string | null;
    source?: string | null;
    reason?: string | null;
    requested_start?: string;
    requested_end?: string;
    normalized_window?: boolean;
    fallback_applied?: boolean;
    fallback_start?: string;
    fallback_end?: string;
  };
  frames: SunpyExportFrame[];
  events: SunpyExportEvent[];
  cdaweb?: SunpyCdawebBlock | null;
  jsoc_sharp?: SunpySharpSummary | null;
  jsoc_cutout?: SunpyJsocCutout | null;
  goes_xrs?: SunpyGoesXrsBlock | null;
}

interface SunpyBridgeBin {
  startIso: string;
  endIso: string;
  phaseRad: number;
  frameCount: number;
  eventCount: number;
  alignment: number;
  entropy: number;
  energy: number;
  dispersion: number;
  turbulence?: number;
  flareFlux?: number;
  flareFluxNorm?: number;
  sharpFlux?: number;
  goesFlux?: number;
}

interface SunpyBridgeSummary {
  t0Iso: string;
  binCount: number;
  frameCount: number;
  eventCount: number;
  bins: SunpyBridgeBin[];
}

type DisplayGrid = { gridSize: number; data: Float32Array; diskGeom?: DiskGeom };
type Hotspot = { peak: number; areaFrac: number; u: number; v: number; radius: number };
type SunpyPreflight = {
  available_frames: number;
  tables?: number;
  reason?: string | null;
  requested_start?: string;
  requested_end?: string;
  start?: string;
  end?: string;
  instrument?: string;
  wavelength?: number;
  timestamp_utc?: string;
  source?: string;
  error?: string;
  fallback_attempted?: boolean;
  fallback_applied?: boolean;
  fallback_start?: string;
  fallback_end?: string;
  initial_reason?: string | null;
};

const solarObservationViewStore=createSolarObservationViewStore<SunpyExportPayload>();
const SolarMagneticGlobe=React.lazy(()=>import("@/components/SolarMagneticGlobe").then(module=>({default:module.SolarMagneticGlobe})));
const StellarSceneContext=React.lazy(()=>import("@/components/StellarSceneContext").then(module=>({default:module.StellarSceneContext})));

export default function StarWatcherPanel() {
  const [activePage, setActivePage] = React.useState<SolarWorkbenchPage>("surface");
  const [surfaceView, setSurfaceView] = React.useState<"disk" | "magnetic-globe" | "graphs">("disk");
  const [magneticAcquisitionId,setMagneticAcquisitionId]=React.useState<string|null>(null);
  const [hmiMagneticAcquisitionId,setHmiMagneticAcquisitionId]=React.useState<string|null>(null);
  const openSpecialistPanel = useWorkstationLayoutStore((state) => state.openPanelInActiveGroup);
  const optionsMenuRef = useRef<HTMLDetailsElement>(null);
  const [sunpyData, setSunpyData] = useSolarObservationView(solarObservationViewStore);
  const [liveChannel, setLiveChannel] = React.useState<SdoLiveChannel>("hmiContinuum");
  const [livePreview, setLivePreview] = React.useState<SdoLivePreview | null>(null);
  const [livePreviewStatus, setLivePreviewStatus] = React.useState("Checking solar browse sources…");
  const [liveRefreshGeneration, setLiveRefreshGeneration] = React.useState(0);
  const [registeredMode, setRegisteredMode] = React.useState(false);
  const [registeredReceipt, setRegisteredReceipt] = React.useState<RegisteredSolarRegionsReceipt | null>(null);
  const [registeredStatus, setRegisteredStatus] = React.useState("");
  const [registeredBusy, setRegisteredBusy] = React.useState(false);
  const [registeredRefreshGeneration, setRegisteredRefreshGeneration] = React.useState(0);
  const [jsocConnection, setJsocConnection] = React.useState<JsocConnectionStatus | null>(null);
  const [jsocEmailInput, setJsocEmailInput] = React.useState("");
  const [jsocConnectionMessage, setJsocConnectionMessage] = React.useState("");
  const [jsocConnectionBusy, setJsocConnectionBusy] = React.useState(false);
  const [jsocStatusGeneration, setJsocStatusGeneration] = React.useState(0);
  const jsocRequestGeneration = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/star-watcher/source-connections/jsoc", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((value: JsocConnectionStatus | null) => {
        if (!controller.signal.aborted && value?.schemaVersion === "solar-jsoc-session-connection/1") setJsocConnection(value);
      }).catch(() => { /* Connection status is displayed as unavailable below. */ });
    return () => controller.abort();
  }, [jsocStatusGeneration]);
  const updateJsocConnection = async (mode: "connect" | "disconnect") => {
    const requestGeneration = ++jsocRequestGeneration.current;
    setJsocConnectionBusy(true);
    setJsocConnectionMessage("");
    try {
      const response = await fetch("/api/star-watcher/source-connections/jsoc", {
        method: mode === "connect" ? "POST" : "DELETE",
        credentials: "same-origin", cache: "no-store",
        headers: mode === "connect" ? { "Content-Type": "application/json" } : undefined,
        body: mode === "connect" ? JSON.stringify({ email: jsocEmailInput }) : undefined,
      });
      if (!response.ok) throw new Error("connection update rejected");
      const value = await response.json() as JsocConnectionStatus;
      if (value.schemaVersion !== "solar-jsoc-session-connection/1") throw new Error("connection response invalid");
      if (requestGeneration !== jsocRequestGeneration.current) return;
      setJsocConnection(value);
      setJsocEmailInput("");
      setJsocConnectionMessage(mode === "connect" ? "JSOC email saved for this server session. Provider registration is not verified." : "Session connection removed.");
    } catch {
      if (requestGeneration !== jsocRequestGeneration.current) return;
      setJsocConnectionMessage("Connection update failed. Check the email and signed-in developer session.");
    } finally { if (requestGeneration === jsocRequestGeneration.current) setJsocConnectionBusy(false); }
  };
  useEffect(() => {
    if (sunpyData) {
      setLivePreview(null);
      setLivePreviewStatus("Selected observation or replay is shown; automatic live preview paused.");
      return;
    }
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`/api/star-watcher/live-preview?channel=${liveChannel}`, {
          credentials: "same-origin", cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw new Error("latest preview unavailable");
        const preview = await response.json() as SdoLivePreview;
        const expectedSourceUrl = expectedLiveSourceUrl(liveChannel, preview.sourceId, preview.upstreamImageId);
        const expectedWavelength = liveChannel === "aia193" ? (preview.sourceId === "sdo" ? 193 : 195) :
          liveChannel === "aia171" ? 171 : null;
        if (preview.schemaVersion !== "solar-live-preview/2" || preview.channel !== liveChannel ||
            preview.productKind !== "browse_image" || preview.scienceRunAllowed !== false ||
            preview.quantitativeComparisonAllowed !== false ||
            !expectedSourceUrl || preview.sourceUrl !== expectedSourceUrl ||
            preview.wavelength_A !== expectedWavelength ||
            preview.instrument !== (preview.sourceId === "sdo" || preview.sourceId === "helioviewer-hmi" || preview.sourceId === "helioviewer-hmi-mag" ?
              (liveChannel === "hmiMag" || liveChannel === "hmiContinuum" ? "HMI" : "AIA") : "SUVI") ||
            preview.source !== (preview.sourceId === "sdo" ? "NASA/SDO" :
              preview.sourceId === "helioviewer-hmi" || preview.sourceId === "helioviewer-hmi-mag" ? "Helioviewer / NASA SDO HMI" :
              preview.sourceId === "suvi-primary" ? "NOAA/SWPC SUVI primary" : "NOAA/SWPC SUVI secondary") ||
            (preview.sourceId === "helioviewer-hmi" || preview.sourceId === "helioviewer-hmi-mag" ?
              typeof preview.observationAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(preview.observationAt) ||
                !Number.isFinite(Date.parse(preview.observationAt)) : preview.observationAt !== null) ||
            preview.imageUrl !== `/api/star-watcher/live-preview/image?channel=${liveChannel}&source=${preview.sourceId}&sha256=${preview.sha256}` ||
            !/^[a-f0-9]{64}$/.test(preview.sha256)) throw new Error("latest preview identity invalid");
        if (controller.signal.aborted) return;
        setLivePreview(preview);
        setLivePreviewStatus(preview.stale ? `No recent compatible observation; showing the last dated ${preview.source} browse image.` :
          preview.sourceId === "sdo" ? "Recent SDO browse publication loaded; exposure time unverified." :
          preview.sourceId === "helioviewer-hmi" || preview.sourceId === "helioviewer-hmi-mag" ?
            `Helioviewer HMI fallback loaded; observed ${preview.observationAt}.` :
          `SDO preview is stale or unavailable; showing ${preview.source} EUV context.`);
      } catch {
        if (controller.signal.aborted) return;
        setLivePreview(null);
        setLivePreviewStatus("Live preview unavailable; saved observations and manual search remain available.");
      }
    };
    setLivePreview(null);
    setLivePreviewStatus("Checking solar browse sources…");
    void load();
    const timer = window.setInterval(() => { void load(); }, 5 * 60_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [liveChannel, liveRefreshGeneration, sunpyData]);
  React.useEffect(() => {
    if (!registeredMode || sunpyData || (liveChannel !== "hmiContinuum" && liveChannel !== "hmiMag")) {
      setRegisteredReceipt(null);
      setRegisteredBusy(false);
      return;
    }
    const controller = new AbortController();
    setRegisteredReceipt(null);
    setRegisteredBusy(true);
    setRegisteredStatus("Loading an exact HMI image and NOAA report registration…");
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      setRegisteredBusy(true);
      try {
        const response = await fetch(`/api/star-watcher/active-regions/registered?channel=${liveChannel}`, {
          credentials: "same-origin", cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw new Error("registration unavailable");
        const value: unknown = await response.json();
        if (!isRegisteredSolarRegionsReceipt(value, liveChannel)) throw new Error("registration invalid");
        if (controller.signal.aborted) return;
        setRegisteredReceipt(value);
        setRegisteredStatus("");
      } catch {
        if (controller.signal.aborted) return;
        setRegisteredReceipt(null);
        setRegisteredStatus("Exact image/report registration unavailable. The latest browse image remains unlabeled; retry when both sources are available.");
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setRegisteredBusy(false);
      }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 5 * 60_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [registeredMode, registeredRefreshGeneration, liveChannel, sunpyData]);
  const registeredView = !sunpyData && registeredMode && registeredReceipt?.image.channel === liveChannel ? registeredReceipt : null;
  const [videoSrc, setVideoSrc] = React.useState<Source | null>(null);
  const [status, setStatus] = React.useState<string>("Idle");
  const [metrics, setMetrics] = React.useState<Metrics | null>(null);
  const [overlay, setOverlay] = React.useState<SolarOverlay | null>(null);
  const [frameIndex, setFrameIndex] = React.useState(0);
  const [field, setField] = React.useState<OverlayField>("intensity");
  const [autoStretch, setAutoStretch] = React.useState(true);
  const [lockSun, setLockSun] = React.useState(false);
  const [report, setReport] = React.useState<string>("");
  const [currentHotspots, setCurrentHotspots] = React.useState<Hotspot[]>([]);
  const [debugLog, setDebugLog] = React.useState<string[]>([]);
  const defaultSunpyEnd = new Date().toISOString().slice(0, 19);
  const defaultSunpyStart = new Date(Date.now() - 15 * 60 * 1000).toISOString().slice(0, 19);
  const [sunpyForm, setSunpyForm] = React.useState({
    start: defaultSunpyStart,
    end: defaultSunpyEnd,
    instrument: "AIA",
    wavelength: "193",
    maxFrames: 3,
  });
  const [sunpyEventTypes, setSunpyEventTypes] = React.useState<Record<string, boolean>>({
    FL: true,
    AR: true,
    CH: true,
  });
  const [selectedResearchRecordId, setSelectedResearchRecordId] = React.useState<string>();
  const [selectedLocalResearchBundle, setSelectedLocalResearchBundle] = React.useState<unknown>(null);
  const [sunpyStatus, setSunpyStatus] = React.useState<string>(()=>solarObservationViewStore.getSnapshot()
    ? "Previously loaded observation restored from renderer memory; acquisition time unchanged."
    : "SunPy/HEK idle");
  const [sunpyLoading, setSunpyLoading] = React.useState(false);
  const sunpyRequest = useRef<AbortController | null>(null);
  const observationOwnership=useRef(createSolarObservationOwnership());
  const snapshotSaveAttempt=useRef(0);
  const sunpyPreflightRequest = useRef<AbortController | null>(null);
  useEffect(() => () => { observationOwnership.current.begin();sunpyRequest.current?.abort(); sunpyPreflightRequest.current?.abort(); }, []);
  const [sunpyImagesOnly, setSunpyImagesOnly] = React.useState(true);
  const [replayStatus, setReplayStatus] = React.useState("");
  const [solarRuntime, setSolarRuntime] = React.useState<{ available: boolean; reason?: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/star-watcher/runtime-capability", { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(value => { if (value && typeof value.available === "boolean") setSolarRuntime(value); })
      .catch(() => { /* API connection state remains distinct from Python capability. */ });
    return () => controller.abort();
  }, []);
  const [sunpyPreflight, setSunpyPreflight] = React.useState<SunpyPreflight | null>(null);
  const [sunpyPreflightStatus, setSunpyPreflightStatus] = React.useState<string>("SunPy preflight idle");
  useEffect(()=>{
    const changed=()=>{
      observationOwnership.current.begin();snapshotSaveAttempt.current++;
      sunpyRequest.current?.abort();sunpyRequest.current=null;
      sunpyPreflightRequest.current?.abort();sunpyPreflightRequest.current=null;
      setSunpyLoading(false);setSunpyPreflight(null);setReplayStatus("");
      setReport("");setDebugLog([]);
      setSunpyStatus("Account policy changed; loaded observation cleared.");
      setSelectedResearchRecordId(undefined);
      setSelectedLocalResearchBundle(null);
      setSunpyPreflightStatus("SunPy preflight idle");setFrameIndex(0);
      setSelectedEventId(null);setHoverEventId(null);
      setLivePreview(null);setLiveRefreshGeneration((value) => value + 1);
      jsocRequestGeneration.current++;
      setJsocConnection(null);setJsocEmailInput("");setJsocConnectionMessage("");setJsocConnectionBusy(false);
      setJsocStatusGeneration((value) => value + 1);
      setMagneticAcquisitionId(null);
      setHmiMagneticAcquisitionId(null);
    };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,changed);
    return ()=>window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,changed);
  },[]);
  const [selectedEventId, setSelectedEventId] = React.useState<string | null>(null);
  const [hoverEventId, setHoverEventId] = React.useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [canvasSize, setCanvasSize] = React.useState<{ width: number; height: number }>({ width: 640, height: 640 });
  const pushDebug = (msg: string) => {
    const line = `${new Date().toISOString()} :: ${msg}`;
    setDebugLog((prev) => [line, ...prev].slice(0, 100));
  };

  const sampleMemory = React.useCallback(() => {
    try {
      const perf = (window as any).performance;
      const mem = perf?.memory;
      if (mem && typeof mem.usedJSHeapSize === "number" && typeof mem.totalJSHeapSize === "number") {
        const usedMb = mem.usedJSHeapSize / (1024 * 1024);
        const totalMb = mem.totalJSHeapSize / (1024 * 1024);
        const limitMb = mem.jsHeapSizeLimit ? mem.jsHeapSizeLimit / (1024 * 1024) : null;
        pushDebug(
          `Memory snapshot: used=${usedMb.toFixed(1)} MB total=${totalMb.toFixed(1)} MB${
            limitMb ? ` limit=${limitMb.toFixed(0)} MB` : ""
          }`,
        );
      } else {
        pushDebug("Memory snapshot: performance.memory not available in this browser");
      }
    } catch (err) {
      pushDebug(`Memory snapshot failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const clamp01 = (v: number | undefined | null) => {
    if (!Number.isFinite(v as number)) return 0;
    return Math.max(0, Math.min(1, v as number));
  };

  const deriveMetricsFromStar = (snap: StarTelemetry | null) => {
    if (!snap) return;
    const hasHistoryMeta = snap.driver_history_len !== undefined || snap.driver_history_required !== undefined;
    const historyBins = snap.driver_history_len ?? 0;
    const historyRequired = snap.driver_history_required ?? (hasHistoryMeta ? historyBins || 0 : 0);
    const historyReady =
      snap.driver_history_required !== undefined
        ? historyBins >= historyRequired
        : snap.driver_history_len !== undefined
          ? historyBins > 0
          : true;
    const phaseReady = snap.phase_dispersion_ready ?? historyReady;
    const bandReady = snap.p_mode_ready ?? historyReady;
    const coherence = Number.isFinite(snap.global_coherence) ? clamp01(snap.global_coherence) : null;
    const phaseDispersion =
      phaseReady && Number.isFinite(snap.phase_dispersion) ? clamp01(snap.phase_dispersion) : null;
    const rawBand = snap.p_mode_driver ?? snap.resonance_score;
    const bandPower = bandReady && Number.isFinite(rawBand) ? clamp01(rawBand as number) : null;
    const regime =
      !phaseReady || !bandReady
        ? "warming_up"
        : coherence !== null && phaseDispersion !== null
          ? coherence > 0.65 && phaseDispersion < 0.35
            ? "locked"
            : coherence < 0.35 && phaseDispersion > 0.65
              ? "turbulent"
              : "mixed"
          : "mixed";
    setMetrics({
      coherence,
      phaseDispersion,
      bandPower,
      regime,
      phaseReady,
      bandReady,
      historyBins,
      historyRequired,
      historyAvailable: hasHistoryMeta,
    });
  };

  const refreshStarTelemetry = React.useCallback(async () => {
    try {
      pushDebug("API call: /api/star/telemetry (solar-hek)");
      const res = await fetchWithTimeout(
        "/api/star/telemetry?session_id=solar-hek&session_type=solar",
        { method: "GET" },
        30_000,
      );
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`status=${res.status} body=${text.slice(0, 200)}`);
      }
      const snap = JSON.parse(text) as StarTelemetry;
      deriveMetricsFromStar(snap);
      pushDebug("Star telemetry refreshed");
    } catch (err) {
      pushDebug(`Star telemetry fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  useEffect(() => {
    refreshStarTelemetry();
  }, [refreshStarTelemetry]);

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setVideoSrc({ url, name: file.name });
    setStatus("Ready");
    pushDebug(`File selected: ${file.name} (${file.size} bytes)`);
  };

  const applyHekOnlyPreset = React.useCallback(() => {
    setSunpyImagesOnly(false);
    setSunpyForm((prev) => ({ ...prev, maxFrames: 0 }));
    setSunpyStatus("HEK-only preset: maxFrames=0 (skip SunPy fetch)");
  }, []);

  const applySunpyProbePreset = React.useCallback(() => {
    const endIso = new Date().toISOString().slice(0, 19);
    const startIso = new Date(Date.now() - 10 * 60 * 1000).toISOString().slice(0, 19);
    setSunpyForm((prev) => ({
      ...prev,
      start: startIso,
      end: endIso,
      maxFrames: 1,
      instrument: "AIA",
      wavelength: prev.wavelength || "193",
    }));
    setSunpyEventTypes({ FL: true, AR: false, CH: false, CE: false, CJ: false, EF: false });
    setSunpyStatus("Probe preset: 10-minute window, 1 frame, FL only (180s kill switch)");
  }, []);

  const runSunpyPreflight = React.useCallback(async () => {
    sunpyPreflightRequest.current?.abort();
    if (!sunpyProbeAllowed(solarRuntime, sunpyForm.maxFrames)) {
      setSunpyPreflight(null);
      setSunpyPreflightStatus(sunpyForm.maxFrames === 0 ? "Preflight skipped: HEK-only mode" :
        solarRuntime === null ? "Preflight waiting for runtime capability" :
        "Preflight skipped: solar runtime unavailable; local replay remains available");
      return;
    }
    if (!sunpyForm.start || !sunpyForm.end) {
      setSunpyPreflightStatus("Preflight skipped: start/end required");
      return;
    }
    const params = new URLSearchParams();
    params.set("start", sunpyForm.start);
    params.set("end", sunpyForm.end);
    params.set("instrument", sunpyForm.instrument || "AIA");
    params.set("wave", sunpyForm.wavelength || "193");
    params.set("preflight", "1");
    const probe = new AbortController();
    sunpyPreflightRequest.current = probe;
    setSunpyPreflightStatus("Probing archive (SunPy search only)...");
    try {
      const res = await fetchWithTimeout(`/api/star-watcher/sunpy-export?${params.toString()}`, { method: "GET", signal: probe.signal }, 120_000);
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`status=${res.status} body=${text.slice(0, 200)}`);
      }
      if (probe.signal.aborted) return;
      const payload = JSON.parse(text) as SunpyPreflight;
      setSunpyPreflight(payload);
      const reason = payload.reason ?? (payload.available_frames && payload.available_frames > 0 ? "ok" : "no_aia_data");
      const frames = Number(payload.available_frames ?? 0);
      const fallbackUsed = Boolean(payload.fallback_applied);
      const fallbackTried = Boolean(payload.fallback_attempted);
      const fallbackRange =
        payload.fallback_start && payload.fallback_end ? `${payload.fallback_start} -> ${payload.fallback_end}` : null;
      if (reason === "ok") {
        setSunpyPreflightStatus(`Archive OK${fallbackUsed ? " via fallback window" : ""}: ${frames} frame(s) found`);
      } else {
        const extra = fallbackTried ? " (fallback attempted)" : "";
        setSunpyPreflightStatus(`Archive unavailable (${reason}); frames=${frames}${extra}`);
      }
      const debugBits = [`reason=${reason}`, `frames=${frames}`];
      if (fallbackUsed || fallbackTried) {
        debugBits.push(`fallback=${fallbackRange ?? "auto"}`);
      }
      pushDebug(`SunPy preflight: ${debugBits.join(" ")}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (probe.signal.aborted) return;
      setSunpyPreflight(null);
      setSunpyPreflightStatus(`Preflight failed: ${msg}`);
      pushDebug(`SunPy preflight failed: ${msg}`);
    }
  }, [solarRuntime?.available, sunpyForm.maxFrames, sunpyForm.end, sunpyForm.instrument, sunpyForm.start, sunpyForm.wavelength]);

  useEffect(() => {
    // Debounce preflight when window/channel changes.
    const timer = setTimeout(() => {
      void runSunpyPreflight();
    }, 400);
    return () => { clearTimeout(timer); sunpyPreflightRequest.current?.abort(); };
  }, [runSunpyPreflight]);

  const preflightBlocksFetch = React.useMemo(() => {
    if (!sunpyPreflight) return false;
    const frames = Number(sunpyPreflight.available_frames ?? 0);
    const reason = sunpyPreflight.reason;
    const wantsFrames = (sunpyForm.maxFrames ?? 1) > 0;
    return Boolean(wantsFrames && !!reason && reason !== "ok" && frames <= 0);
  }, [sunpyForm.maxFrames, sunpyPreflight]);

  const loadSunpyData = async () => {
    if (solarRuntime?.available !== true && sunpyForm.maxFrames > 0) {
      setSunpyStatus(solarRuntime === null ? "Waiting for solar runtime capability; local replay remains available." :
        "Solar Python runtime unavailable. Local snapshot replay remains available.");
      return;
    }
    const activeTypes = Object.entries(sunpyEventTypes)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key)
      .join(",");
    if (!activeTypes && !sunpyImagesOnly) {
      setSunpyStatus("Select at least one HEK event type");
      return;
    }
    const params = new URLSearchParams();
    params.set("start", sunpyForm.start);
    params.set("end", sunpyForm.end);
    params.set("instrument", sunpyForm.instrument || "AIA");
    params.set("wave", sunpyForm.wavelength || "193");
    try {
      params.set("maxFrames", sunpyMaxFramesQuery(sunpyForm.maxFrames));
    } catch (error) {
      setSunpyStatus(error instanceof Error ? error.message : "Invalid frame count");
      return;
    }
    params.set("eventTypes", activeTypes);
    if (sunpyImagesOnly) {
      params.set("includeEvents", "false");
      params.set("bridge", "off");
    }
    if (preflightBlocksFetch) {
      const reason = sunpyPreflight?.reason ?? "unavailable";
      const frames = sunpyPreflight?.available_frames ?? 0;
      setSunpyStatus(`SunPy preflight: ${reason}; frames=${frames}. Set maxFrames=0 for HEK-only.`);
      pushDebug(`SunPy preflight blocked fetch (reason=${reason}, frames=${frames})`);
      return;
    }
    setSunpyLoading(true);
    const selectedObservation=observationOwnership.current.begin();
    sunpyRequest.current?.abort();
    const download = new AbortController();
    sunpyRequest.current = download;
    setSunpyStatus("Requesting SunPy + HEK export...");
    try {
      const res = await fetchWithTimeout(
        `/api/star-watcher/sunpy-export?${params.toString()}`,
        { method: "GET", signal: download.signal },
        240_000,
      );
      const text = await res.text();
      let json: SunpyExportPayload | Record<string, unknown> = {};
      try {
        json = JSON.parse(text) as SunpyExportPayload;
      } catch {
        // keep as {}
      }
      if (!res.ok) {
        const code = (json as any)?.error ?? res.status;
        const msg = (json as any)?.message ?? res.statusText;
        throw new Error(`sunpy-export failed: status=${res.status} code=${code} msg=${msg} body=${text?.slice(0, 400)}`);
      }
      const payload = json as SunpyExportPayload;
      if(!observationOwnership.current.isCurrent(selectedObservation))return;
      if (download.signal.aborted) throw new DOMException("Solar request cancelled", "AbortError");
      if(sunpyForm.maxFrames>0 && (!Array.isArray(payload.frames) || payload.frames.length===0))
        throw new Error(`No observation images returned; previous observation retained (${payload.meta?.frames_missing_reason ?? payload.reason ?? 'empty export'}).`);
      setSunpyData(payload);
      // A fresh archive response must not inherit a previous replay/save receipt.
      setReplayStatus("");
      setFrameIndex(0);
      setSelectedEventId(null);
      setHoverEventId(null);
      if (payload.debug?.fallback_applied || payload.meta?.fallback_applied) {
        const fStart = payload.debug?.fallback_start ?? payload.meta?.fallback_start;
        const fEnd = payload.debug?.fallback_end ?? payload.meta?.fallback_end;
        pushDebug(
          `SunPy fallback used older window to dodge ingest gap${fStart && fEnd ? ` (${fStart} -> ${fEnd})` : ""}`,
        );
      } else if (payload.debug?.fallback_attempted) {
        pushDebug("SunPy fallback attempted but archive still returned no frames");
      }
      refreshStarTelemetry();
      if (!sunpyImagesOnly && !payload.events?.length) {
        try {
          const evParams = new URLSearchParams();
          evParams.set("start", sunpyForm.start);
          evParams.set("end", sunpyForm.end);
          evParams.set("eventTypes", activeTypes);
          evParams.set("sunpy", "1");
          pushDebug("API call: /api/star-watcher/solar-events (HEK fallback)");
          const evRes = await fetchWithTimeout(
            `/api/star-watcher/solar-events?${evParams.toString()}`,
            { method: "GET", signal: download.signal },
            120_000,
          );
          const evText = await evRes.text();
          if(download.signal.aborted || !observationOwnership.current.isCurrent(selectedObservation))return;
          if (evRes.ok) {
            const evJson = JSON.parse(evText) as { events?: SunpyExportEvent[] };
            if (Array.isArray(evJson.events)) {
              setSunpyData((prev) =>
                !observationOwnership.current.isCurrent(selectedObservation) || download.signal.aborted ? prev : prev
                  ? { ...prev, events: evJson.events ?? prev.events ?? [] }
                  : { ...payload, events: evJson.events ?? [] },
              );
              pushDebug(`HEK fallback loaded ${evJson.events.length} events`);
            }
          } else {
            pushDebug(`HEK fallback failed: status=${evRes.status} body=${evText.slice(0, 200)}`);
          }
        } catch (err) {
          if(!observationOwnership.current.isCurrent(selectedObservation))return;
          pushDebug(`HEK fallback error: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      const frames = payload.frames?.length ?? 0;
      if(!observationOwnership.current.isCurrent(selectedObservation))return;
      const events = payload.events?.length ?? 0;
      const reason = payload.reason ?? payload.debug?.reason ?? payload.meta?.reason;
      const fallback = payload.debug?.fallback;
      const timeoutMs = payload.debug?.timeout_ms;
      const killLabel = timeoutMs ? ` (kill ${Math.round(timeoutMs / 1000)}s)` : "";
      if (fallback || reason) {
        const friendlyFallback =
          reason === "timeout" || fallback === "sunpy_timeout"
            ? "SunPy exporter timeout"
            : reason === "no_aia_data" || fallback === "sunpy_no_results" || fallback === "sunpy_no_data"
              ? "SunPy returned no images"
              : fallback?.includes("hek_only")
                ? "HEK-only path"
                : fallback
                  ? `fallback=${fallback}`
                  : `reason=${reason}`;
        setSunpyStatus(`${friendlyFallback}${killLabel}; frames=${frames}, events=${events}`);
      } else {
        setSunpyStatus(`SunPy ready: frames=${frames}, events=${events} @${payload.instrument} ${payload.wavelength_A}A`);
      }
    } catch (err) {
      if(!observationOwnership.current.isCurrent(selectedObservation))return;
      const msg = err instanceof Error ? err.message : String(err);
      setSunpyStatus(download.signal.aborted ? "Solar download cancelled; previously loaded observation retained." : `SunPy/HEK load failed: ${msg}`);
    } finally {
      if (sunpyRequest.current === download) {sunpyRequest.current = null;setSunpyLoading(false);}
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const updateSize = () => {
      const width = video.videoWidth || canvasSize.width;
      const height = video.videoHeight || canvasSize.height;
      if (width && height && (width !== canvasSize.width || height !== canvasSize.height)) {
        setCanvasSize({ width, height });
      }
    };
    video.addEventListener("loadedmetadata", updateSize);
    return () => video.removeEventListener("loadedmetadata", updateSize);
  }, [videoSrc, canvasSize.width, canvasSize.height]);

  useEffect(() => {
    const total = sunpyData?.frames?.length ?? overlay?.frames?.length ?? 0;
    if (!total) return;
    setFrameIndex((idx) => Math.min(idx, total - 1));
  }, [overlay, sunpyData]);

  const solarCoherenceMutation = useMutation({
    mutationFn: async (payload: { file: File }) => {
      const form = new FormData();
      form.append("file", payload.file);
      form.append("gridSize", "192");
      form.append("instrumentTag", "suvi_195");
      const tStart = Date.now();
      pushDebug("API call: /api/star-watcher/solar-coherence (POST)");
      const res = await fetchWithTimeout(
        "/api/star-watcher/solar-coherence",
        {
          method: "POST",
          body: form,
        },
        300_000, // allow up to 5 minutes for large ingests
      ).catch((err) => {
        const origin = typeof window !== "undefined" ? window.location.origin : "unknown origin";
        throw new Error(
          `fetch /api/star-watcher/solar-coherence failed: ${err instanceof Error ? err.message : String(err)} (is the API server running and reachable on ${origin}?)`,
        );
      });
      pushDebug(`API response: status=${res.status} (${Date.now() - tStart} ms)`);
      const text = await res.text();
      let json: SolarCoherenceResponse | Record<string, unknown> = {};
      try {
        json = JSON.parse(text) as SolarCoherenceResponse;
      } catch {
        // leave json as {}
      }
      if (!res.ok) {
        const code = (json as any)?.error ?? res.status;
        const msg = (json as any)?.message ?? res.statusText;
        throw new Error(`solar-coherence failed: status=${res.status} code=${code} msg=${msg} body=${text?.slice(0, 500)}`);
      }
      return json as SolarCoherenceResponse;
    },
  });

  const handleIngest = async () => {
    if (!videoSrc) {
      setStatus("Load a solar feed before ingesting");
      return;
    }
    let stage = "init";
    setStatus("Ingesting - fetching feed");
    pushDebug("Ingest started: fetching feed");
    try {
      const src = videoSrc.url;
      stage = "fetch_feed";
      const resp = await fetch(src);
      if (!resp.ok) {
        throw new Error(`feed fetch failed status=${resp.status} msg=${resp.statusText}`);
      }
      pushDebug(`Feed fetched ok: status=${resp.status}`);
      stage = "read_blob";
      const blob = await resp.blob();
      pushDebug(`Blob read: ${blob.size} bytes`);
      stage = "build_file";
      const file = new File([blob], videoSrc.name || "solar.gif", { type: blob.type || "image/gif" });
      stage = "call_coherence_api";
      pushDebug("Calling /api/star-watcher/solar-coherence");
      const result = await solarCoherenceMutation.mutateAsync({ file });

      const frames: SunFrame[] = (result.frames ?? []).map((frame) => ({
        t: frame.t,
        gridSize: frame.gridSize,
        mapSun: decodeFloat32(frame.mapSunCorot_b64 ?? frame.mapSun_b64),
        mapSunObserver: decodeFloat32(frame.mapSun_b64),
        rotationShiftPx: frame.rotationShiftPx,
        diskGeom: frame.diskGeom,
      }));
      const map = {
        gridSize: result.map.gridSize,
        coherence: decodeFloat32(result.map.coherence_b64),
        phaseDispersion: decodeFloat32(result.map.phaseDispersion_b64),
        energy: decodeFloat32(result.map.energy_b64),
      };
      setOverlay({ frames, map, caption: result.caption });
      const ingestCoherence = clamp01(result.global.coherence);
      const ingestDispersion = clamp01(result.global.dispersion);
      const ingestBand = clamp01(normalizeEnergy(result.global.energy, result.map.gridSize));
      const ingestRegime =
        ingestCoherence > 0.65 && ingestDispersion < 0.35
          ? "locked"
          : ingestCoherence < 0.35 && ingestDispersion > 0.65
            ? "turbulent"
            : "mixed";
      const historyBins = result.frameCount ?? frames.length ?? 0;
      setMetrics({
        coherence: ingestCoherence,
        phaseDispersion: ingestDispersion,
        bandPower: ingestBand,
        regime: ingestRegime,
        phaseReady: true,
        bandReady: true,
        historyBins,
        historyRequired: historyBins,
        historyAvailable: true,
      });
      setFrameIndex(0);
      const caption = result.caption ? ` - ${result.caption}` : "";
      setStatus(`Ingest complete${caption}`);
      pushDebug(
        `Ingest complete: frames=${result.frames?.length ?? 0} grid=${result.map.gridSize} globalC=${result.global.coherence.toFixed(3)}`,
      );
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Ingest failed";
      setStatus(`Ingest failed at ${stage}: ${message}`);
      pushDebug(`Ingest failed at ${stage}: ${message}`);
    }
  };

  const currentFrame = React.useMemo(() => {
    if (!overlay?.frames?.length) return null;
    const clamped = Math.min(Math.max(frameIndex, 0), overlay.frames.length - 1);
    return overlay.frames[clamped];
  }, [overlay, frameIndex]);

  const currentSunpyFrame = React.useMemo(() => {
    if (!sunpyData?.frames?.length) return null;
    const clamped = Math.min(Math.max(frameIndex, 0), sunpyData.frames.length - 1);
    return sunpyData.frames[clamped];
  }, [sunpyData, frameIndex]);

  const currentTimeIso = React.useMemo(() => {
    if (currentSunpyFrame?.obstime) return currentSunpyFrame.obstime;
    if (currentFrame) return new Date(currentFrame.t).toISOString();
    return null;
  }, [currentSunpyFrame, currentFrame]);

  const activeSunpyEvents = React.useMemo(() => {
    if (!sunpyData?.events) return [];
    if (!currentTimeIso) return sunpyData.events;
    const t = Date.parse(currentTimeIso);
    return sunpyData.events.filter((ev) => {
      const startMs = Date.parse(ev.start_time ?? ev.start ?? "");
      const endMs = Date.parse(ev.end_time ?? ev.end ?? "");
      if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
        return startMs <= t && t <= endMs;
      }
      if (Number.isFinite(startMs)) return t >= startMs;
      if (Number.isFinite(endMs)) return t <= endMs;
      return true;
    });
  }, [sunpyData, currentTimeIso]);

  const findSunpyEventById = React.useCallback(
    (id: string | null) => {
      if (!id) return null;
      return (sunpyData?.events ?? []).find((ev) => (ev.id ?? ev.ivorn) === id) ?? null;
    },
    [sunpyData?.events],
  );

  const researchObservationArchive = React.useMemo(() => {
    if (!sunpyData) return undefined;
    if (!sunpyData.frames?.length) return sunpyData;
    if (sunpyData.meta?.source === 'imported_observation_replay' &&
        frameIndex === (sunpyData.selected_event_context?.selectedFrameIndex ??
          sunpyData.selected_goes_window?.selectedFrameIndex ?? 0) &&
        selectedEventId === (sunpyData.selected_event_context?.eventId ?? null)) return sunpyData;
    try {
      const selectedIndex = Math.min(Math.max(frameIndex, 0), sunpyData.frames.length - 1);
      const retainedEvent = sunpyData.selected_event_context;
      const selectedEvent = findSunpyEventById(selectedEventId) ??
        (retainedEvent?.eventId === selectedEventId ? {id:retainedEvent.eventId,event_type:retainedEvent.eventType,
          start_time:retainedEvent.eventStartUtc,end_time:retainedEvent.eventEndUtc ?? undefined,
          frm_name:retainedEvent.detectionMethod ?? undefined} : null);
      const selection = selectedEvent ? createSolarEventImageSelection(selectedEvent, selectedIndex, sunpyData.frames.length) : null;
      const retainedBins = sunpyData.selected_goes_window?.bins.map(bin=>({
        start:bin.startUtc,end:bin.endUtc,mean_long:bin.meanLongWm2})) ?? [];
      const graph = createSolarGoesFrameWindow({frames:sunpyData.frames,selectedFrameIndex:selectedIndex,
        bins:sunpyData.goes_xrs?.bins ?? retainedBins});
      const {archive_identity:_oldIdentity,selected_event_context:_oldEvent,selected_goes_window:_oldGraph,...base}=sunpyData;
      return {...base,...(selection?{selected_event_context:selection}:{}),
        ...(graph?{selected_goes_window:graph}: {})};
    } catch {
      // The image is still inspectable; an invalid event assertion is never
      // smuggled into a saved package or silently treated as source evidence.
      return sunpyData;
    }
  }, [sunpyData, selectedEventId, frameIndex, findSunpyEventById]);

  const eventToGlyph = React.useCallback(
    (ev: SunpyExportEvent, idx: number): DiskEventGlyph | null => {
      const id = ev.id ?? ev.ivorn ?? `${ev.event_type ?? "EV"}-${idx}`;
      if (!Number.isFinite(ev.u) || !Number.isFinite(ev.v)) return null;
      return {
        id,
        type: ev.event_type ?? "EV",
        u: ev.u ?? 0,
        v: ev.v ?? 0,
        label: ev.event_type ?? "EV",
        selected: selectedEventId === id || hoverEventId === id,
      };
    },
    [hoverEventId, selectedEventId],
  );

  const activeEventGlyphs: DiskEventGlyph[] = React.useMemo(() => {
    const base = (activeSunpyEvents ?? [])
      .map((ev, idx) => eventToGlyph(ev, idx))
      .filter((ev): ev is DiskEventGlyph => Boolean(ev));
    const extras: DiskEventGlyph[] = [];
    [hoverEventId, selectedEventId].forEach((id) => {
      if (!id) return;
      if (base.some((g) => g.id === id)) return;
      const ev = findSunpyEventById(id);
      if (!ev) return;
      const glyph = eventToGlyph(ev, 0);
      if (glyph) extras.push(glyph);
    });
    return [...base, ...extras];
  }, [activeSunpyEvents, eventToGlyph, findSunpyEventById, hoverEventId, selectedEventId]);

  const sunpyEventCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    (sunpyData?.events ?? []).forEach((ev) => {
      const key = (ev.event_type ?? "??").toUpperCase();
      counts[key] = (counts[key] ?? 0) + 1;
    });
    return counts;
  }, [sunpyData]);

  const sunpyFlareRows = React.useMemo(() => {
    const rows = (sunpyData?.events ?? [])
      .filter((ev) => (ev.event_type ?? "").toUpperCase() === "FL")
      .map((ev, idx) => {
        const id = ev.id ?? ev.ivorn ?? `FL-${idx}`;
        const start = ev.start_time ?? ev.start ?? "";
        const end = ev.end_time ?? ev.end ?? "";
        return {
          id,
          goesClass: ev.goes_class ?? "--",
          start,
          end,
          noaaAr: ev.noaa_ar,
          u: ev.u,
          v: ev.v,
          peakFlux: ev.peak_flux,
        };
      });
    rows.sort((a, b) => Date.parse(b.start ?? "") - Date.parse(a.start ?? ""));
    return rows;
  }, [sunpyData]);

  const sunpyBridgeBins = React.useMemo(() => {
    const bins = sunpyData?.bridge?.bins ?? [];
    return [...bins].sort((a, b) => Date.parse(b.startIso) - Date.parse(a.startIso));
  }, [sunpyData]);

  const sunpyBridgeTotals = React.useMemo(() => {
    if (!sunpyData?.bridge) return null;
    return {
      bins: sunpyData.bridge.binCount ?? sunpyBridgeBins.length,
      frames: sunpyData.bridge.frameCount ?? 0,
      events: sunpyData.bridge.eventCount ?? 0,
      t0: sunpyData.bridge.t0Iso,
    };
  }, [sunpyData, sunpyBridgeBins]);

  const sunpyTurbulenceStats = React.useMemo(() => {
    const vals = sunpyBridgeBins
      .map((b) => (Number.isFinite(b.turbulence as number) ? (b.turbulence as number) : null))
      .filter((v): v is number => v !== null);
    if (!vals.length) return null;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const max = Math.max(...vals);
    return { avg, max, count: vals.length };
  }, [sunpyBridgeBins]);

  const sunpyFlareFluxStats = React.useMemo(() => {
    const vals = sunpyBridgeBins
      .map((b) => (Number.isFinite(b.flareFlux as number) ? (b.flareFlux as number) : 0))
      .filter((v) => v > 0);
    if (!vals.length) return null;
    const total = vals.reduce((a, b) => a + b, 0);
    const peak = Math.max(...vals);
    const normPeak = Math.max(...sunpyBridgeBins.map((b) => b.flareFluxNorm ?? 0));
    return { total, peak, normPeak };
  }, [sunpyBridgeBins]);

  const sunpyGoesStats = React.useMemo(() => {
    const bins = sunpyData?.goes_xrs?.bins ?? [];
    if (!bins.length) return null;
    const peak = Math.max(...bins.map((b) => b.max_long ?? 0), 0);
    const mean = bins.reduce((acc, b) => acc + (b.mean_long ?? 0), 0) / Math.max(1, bins.length);
    return { peak, mean, count: bins.length };
  }, [sunpyData]);

  const sunpyCdawebBlock = sunpyData?.cdaweb ?? null;
  const sunpySharpSummary = sunpyData?.jsoc_sharp ?? null;

  const bridgeGridSize = React.useMemo(() => {
    const fromEvents = sunpyData?.events?.find((ev) => Number.isFinite(ev.grid_n as number))?.grid_n;
    if (Number.isFinite(fromEvents as number)) return Number(fromEvents);
    const fromFrames = sunpyData?.frames?.find((f) => Number.isFinite(f.grid_size as number))?.grid_size;
    if (Number.isFinite(fromFrames as number)) return Number(fromFrames);
    return null;
  }, [sunpyData]);

  const bridgeRsunArcsec = React.useMemo(() => {
    if (Number.isFinite(sunpyData?.rsun_arcsec as number)) return Number(sunpyData?.rsun_arcsec);
    const fromEvent = sunpyData?.events?.find((ev) => Number.isFinite(ev.grid_rsun_arcsec as number))?.grid_rsun_arcsec;
    if (Number.isFinite(fromEvent as number)) return Number(fromEvent);
    return null;
  }, [sunpyData]);

  const bridgeGridMeta = React.useMemo(() => {
    const events = sunpyData?.events ?? [];
    let withUv = 0;
    let onDisk = 0;
    let withCell = 0;
    const rows: Array<{
      id: string;
      type: string;
      startIso: string;
      u: number;
      v: number;
      rho: number | null;
      onDisk: boolean | null;
      cell: { i: number; j: number; n: number } | null;
      goesClass?: string;
      fluxWm2: number;
      mass: number;
      noaaAr?: number;
    }> = [];

    events.forEach((ev, idx) => {
      const uvValid = Number.isFinite(ev.u as number) && Number.isFinite(ev.v as number);
      if (uvValid) withUv++;
      const rho = uvValid ? Math.sqrt((ev.u as number) * (ev.u as number) + (ev.v as number) * (ev.v as number)) : null;
      const onDiskFlag = ev.on_disk ?? (rho !== null ? rho <= 1.02 : null);
      if (onDiskFlag) onDisk++;
      const cell = resolveGridCell(ev, bridgeGridSize);
      if (cell) withCell++;
      const startIso = ev.start_time ?? ev.start ?? ev.end_time ?? ev.end ?? "";
      const fluxWm2 = eventPeakFluxWm2(ev);
      const mass = estimateFlareMass(ev);
      if (uvValid && cell) {
        rows.push({
          id: ev.id ?? ev.ivorn ?? `${ev.event_type ?? "EV"}-${idx}`,
          type: ev.event_type ?? "EV",
          startIso,
          u: ev.u as number,
          v: ev.v as number,
          rho,
          onDisk: onDiskFlag ?? null,
          cell,
          goesClass: ev.goes_class ?? undefined,
          fluxWm2,
          mass,
          noaaAr: ev.noaa_ar ?? undefined,
        });
      }
    });

    rows.sort((a, b) => (b.fluxWm2 ?? 0) - (a.fluxWm2 ?? 0));

    return { total: events.length, withUv, onDisk, withCell, rows };
  }, [sunpyData, bridgeGridSize]);

  const bridgeCellPct = bridgeGridMeta.total ? Math.round((bridgeGridMeta.withCell / bridgeGridMeta.total) * 100) : 0;
  const bridgeRows = React.useMemo(() => bridgeGridMeta.rows.slice(0, 5), [bridgeGridMeta]);

  const flareWeightRows = React.useMemo(() => {
    const flares = (sunpyData?.events ?? []).filter((ev) => (ev.event_type ?? "").toUpperCase() === "FL");
    const rows = flares
      .map((ev, idx) => {
        const fluxWm2 = eventPeakFluxWm2(ev);
        const mass = estimateFlareMass(ev);
        return {
          id: ev.id ?? ev.ivorn ?? `FL-${idx}`,
          type: ev.event_type ?? "FL",
          goesClass: ev.goes_class ?? undefined,
          startIso: ev.start_time ?? ev.start ?? ev.end_time ?? ev.end ?? "",
          fluxWm2,
          mass,
        };
      })
      .filter((row) => row.mass > 0 || row.fluxWm2 > 0)
      .sort((a, b) => b.mass - a.mass || (b.fluxWm2 ?? 0) - (a.fluxWm2 ?? 0));
    const maxMass = rows.length ? Math.max(...rows.map((r) => r.mass)) : 0;
    return rows.map((r) => ({
      ...r,
      massPct: maxMass > 0 ? Math.min(100, Math.max(0, (r.mass / maxMass) * 100)) : 0,
    }));
  }, [sunpyData]);

  const topFlareRows = React.useMemo(() => flareWeightRows.slice(0, 3), [flareWeightRows]);

  const cdawebSummary = React.useMemo(() => {
    const dataset = sunpyCdawebBlock?.dataset ?? "none";
    const binCount = sunpyCdawebBlock?.bins?.length ?? 0;
    const reason = sunpyCdawebBlock?.reason;
    const turbLabel = sunpyTurbulenceStats
      ? `turb avg ${(sunpyTurbulenceStats.avg * 100).toFixed(0)}% | peak ${(sunpyTurbulenceStats.max * 100).toFixed(0)}%`
      : reason
        ? `reason: ${reason}`
        : "No CDAWeb bins";
    return { dataset, binCount, turbLabel };
  }, [sunpyCdawebBlock, sunpyTurbulenceStats]);

  const goesSparkline = React.useMemo(() => {
    const bins = sunpyBridgeBins;
    if (!bins.length) return null;
    const width = 320;
    const height = 120;
    const centers = bins.map((b) => {
      const t0 = Date.parse(b.startIso);
      const t1 = Date.parse(b.endIso);
      const t = Number.isFinite(t0) && Number.isFinite(t1) ? (t0 + t1) / 2 : Number.isFinite(t0) ? t0 : t1;
      return { t, flare: b.flareFlux ?? 0, flareNorm: b.flareFluxNorm ?? 0, pMode: b.energy ?? 0 };
    });
    const validTimes = centers.map((c) => c.t).filter((t) => Number.isFinite(t));
    const tMin = validTimes.length ? Math.min(...validTimes) : 0;
    const tMax = validTimes.length ? Math.max(...validTimes) : centers.length;
    const span = Math.max(1, tMax - tMin || centers.length);
    const flareLogs = centers.map((c) => Math.log10(Math.max(c.flare, 1e-9)));
    const logMin = Math.min(...flareLogs);
    const logMax = Math.max(...flareLogs);
    const pVals = centers.map((c) => c.pMode);
    const pMin = Math.min(...pVals);
    const pMax = Math.max(...pVals);
    const normLog = (v: number) => (logMax === logMin ? 0.5 : (Math.log10(Math.max(v, 1e-9)) - logMin) / (logMax - logMin));
    const normLin = (v: number) => (pMax === pMin ? 0.5 : (v - pMin) / (pMax - pMin));
    const pointFor = (c: typeof centers[number], v: number) => {
      const x = Number.isFinite(c.t) ? ((c.t - tMin) / span) * width : 0;
      return `${x.toFixed(1)},${(height - v * height).toFixed(1)}`;
    };
    const flarePoints = centers.map((c) => pointFor(c, normLog(c.flare))).join(" ");
    const pModePoints = centers.map((c) => pointFor(c, normLin(c.pMode))).join(" ");
    const binLines = centers.map((c, idx) => {
      const x = Number.isFinite(c.t) ? ((c.t - tMin) / span) * width : (idx / Math.max(1, centers.length - 1)) * width;
      return { x, id: `${c.t}-${idx}` };
    });
    return { width, height, flarePoints, pModePoints, binLines, logMin, logMax, pMin, pMax };
  }, [sunpyBridgeBins]);

  const cdawebSeries = React.useMemo(() => {
    const bins = sunpyCdawebBlock?.bins ?? [];
    if (!bins.length) return null;
    const width = 320;
    const height = 120;
    const centers = bins.map((b) => {
      const t0 = Date.parse(b.start ?? "");
      const t1 = Date.parse(b.end ?? "");
      const t = Number.isFinite(t0) && Number.isFinite(t1) ? (t0 + t1) / 2 : Number.isFinite(t0) ? t0 : t1;
      const dur = Number.isFinite(t0) && Number.isFinite(t1) ? Math.max(0, t1 - t0) : 0;
      const bmag = b.mean ?? b.rms ?? 0;
      const turb = b.variance ?? 0;
      return { t, dur, bmag, turb };
    });
    const validTimes = centers.map((c) => c.t).filter((t) => Number.isFinite(t));
    const tMin = validTimes.length ? Math.min(...validTimes) : 0;
    const tMax = validTimes.length ? Math.max(...validTimes) : centers.length;
    const span = Math.max(1, tMax - tMin || centers.length);
    const bVals = centers.map((c) => c.bmag);
    const bMax = Math.max(...bVals, 1);
    const turbVals = centers.map((c) => c.turb);
    const turbMax = Math.max(...turbVals, 1);
    const bars = centers.map((c, idx) => {
      const x = Number.isFinite(c.t) ? ((c.t - tMin) / span) * width : (idx / Math.max(1, centers.length - 1)) * width;
      const w = c.dur && Number.isFinite(c.dur) ? Math.max(2, (c.dur / span) * width) : Math.max(2, width / Math.max(centers.length, 1));
      const h = (Math.max(0, c.bmag) / bMax) * height;
      const turbNorm = Math.min(1, Math.max(0, c.turb / turbMax));
      return { x, w, h, turb: turbNorm, id: `${c.t}-${idx}` };
    });
    return { width, height, bars };
  }, [sunpyCdawebBlock?.bins]);

  const nearestSunpyFrameIndex = React.useCallback(
    (iso?: string | null) => {
      if (!sunpyData?.frames?.length || !iso) return null;
      const target = Date.parse(iso);
      if (!Number.isFinite(target)) return null;
      let bestIdx = 0;
      let bestDelta = Number.POSITIVE_INFINITY;
      sunpyData.frames.forEach((f, idx) => {
        const t = Date.parse(f.obstime);
        if (!Number.isFinite(t)) return;
        const delta = Math.abs(t - target);
        if (delta < bestDelta) {
          bestDelta = delta;
          bestIdx = idx;
        }
      });
      return bestIdx;
    },
    [sunpyData],
  );

  const sunpyEventsSorted = React.useMemo(() => {
    const list = [...(sunpyData?.events ?? [])];
    list.sort((a, b) => {
      const ta = Date.parse(a.start_time ?? a.start ?? "") || Date.parse(a.end_time ?? a.end ?? "") || 0;
      const tb = Date.parse(b.start_time ?? b.start ?? "") || Date.parse(b.end_time ?? b.end ?? "") || 0;
      return ta - tb;
    });
    return list;
  }, [sunpyData]);

  const handleEventSelect = React.useCallback(
    (id: string) => {
      setSelectedEventId(id);
      setActivePage("events");
      const target = sunpyData?.events?.find((ev) => (ev.id ?? ev.ivorn) === id);
      const idx = nearestSunpyFrameIndex(
        target?.start_time ?? target?.start ?? target?.end_time ?? target?.end ?? currentTimeIso ?? undefined,
      );
      if (idx !== null && idx !== undefined) {
        setFrameIndex(idx);
      }
    },
    [sunpyData, nearestSunpyFrameIndex, currentTimeIso],
  );

  const handleEventHover = React.useCallback((id: string | null) => {
    setHoverEventId(id);
  }, []);

  const formatIsoShort = (iso?: string | null) => {
    if (!iso) return "n/a";
    return iso.replace("T", " ").slice(0, 19);
  };

  const formatFlux = (v?: number | null) => {
    if (!Number.isFinite(v ?? NaN)) return "n/a";
    const val = v as number;
    if (val === 0) return "0";
    const exp = Math.floor(Math.log10(Math.abs(val)));
    const mant = val / 10 ** exp;
    return `${mant.toFixed(2)}e${exp}`;
  };

  const selectedGrid = React.useMemo<DisplayGrid | null>(() => {
    if (!overlay) return null;
    if (field === "intensity") {
      if (!currentFrame) return null;
      return { gridSize: currentFrame.gridSize, data: currentFrame.mapSun, diskGeom: currentFrame.diskGeom };
    }
    if (field === "coherence") {
      return { gridSize: overlay.map.gridSize, data: overlay.map.coherence, diskGeom: currentFrame?.diskGeom };
    }
    if (field === "phaseDispersion") {
      return { gridSize: overlay.map.gridSize, data: overlay.map.phaseDispersion, diskGeom: currentFrame?.diskGeom };
    }
    if (field === "energy") {
      return { gridSize: overlay.map.gridSize, data: overlay.map.energy, diskGeom: currentFrame?.diskGeom };
    }
    return null;
  }, [overlay, currentFrame, field]);

  const observerGrid = React.useMemo<DisplayGrid | null>(() => {
    if (!overlay) return null;
    if (field === "intensity") {
      if (!currentFrame) return null;
      return { gridSize: currentFrame.gridSize, data: currentFrame.mapSunObserver, diskGeom: currentFrame.diskGeom };
    }
    // For non-intensity layers we use the shared map (co-rotating) for both views.
    return selectedGrid;
  }, [overlay, currentFrame, field, selectedGrid]);

  const sunpyIntensityGrid = React.useMemo<DisplayGrid | null>(() => {
    if (!sunpyData || !sunpyData.frames?.length) return null;
    const frame = currentSunpyFrame;
    if (!frame?.map_b64 || !frame.grid_size) return null;
    try {
      const data = decodeFloat32(frame.map_b64);
      if (frame.grid_size < 32 || frame.grid_size > 512 ||
          !Number.isInteger(frame.grid_size) || data.length !== frame.grid_size ** 2 ||
          data.some(value => !Number.isFinite(value) || value < 0 || value > 1)) return null;
      return { gridSize: frame.grid_size, data };
    } catch {
      return null;
    }
  }, [sunpyData, currentSunpyFrame]);

  const corotatingGrid = React.useMemo<DisplayGrid | null>(() => {
    if (selectedGrid) return selectedGrid;
    return null;
  }, [selectedGrid]);

  const selectedStats = React.useMemo(() => {
    if (!selectedGrid) return null;
    return computeStats(selectedGrid.data, selectedGrid.gridSize);
  }, [selectedGrid]);

  const corotatingStats = React.useMemo(() => {
    if (!corotatingGrid) return null;
    return computeStats(corotatingGrid.data, corotatingGrid.gridSize);
  }, [corotatingGrid]);

  const observerStats = React.useMemo(() => {
    if (!observerGrid) return null;
    return computeStats(observerGrid.data, observerGrid.gridSize);
  }, [observerGrid]);

  const stretchedGridData = React.useMemo(() => {
    if (!corotatingGrid) return null;
    return applyDisplayStretch(corotatingGrid.data, corotatingGrid.gridSize, corotatingStats ?? undefined, autoStretch);
  }, [corotatingGrid, corotatingStats, autoStretch]);

  const stretchedObserverData = React.useMemo(() => {
    if (!observerGrid) return null;
    return applyDisplayStretch(observerGrid.data, observerGrid.gridSize, observerStats ?? undefined, autoStretch);
  }, [observerGrid, observerStats, autoStretch]);

  useEffect(() => {
    const gridForHotspots = field === "intensity" ? observerGrid ?? corotatingGrid : corotatingGrid;
    const statsForHotspots = field === "intensity" ? observerStats ?? corotatingStats : corotatingStats;
    if (!gridForHotspots) {
      setCurrentHotspots([]);
      return;
    }
    if (!statsForHotspots) {
      setCurrentHotspots([]);
      return;
    }
    const threshold = statsForHotspots.p95 ?? statsForHotspots.max;
    const blobs = findHotspots(gridForHotspots.data, gridForHotspots.gridSize, threshold);
    setCurrentHotspots(blobs.slice(0, 5));
  }, [corotatingGrid, observerGrid, corotatingStats, observerStats, field]);

  const generateReport = () => {
    const lines: string[] = [];

    const addHeader = (frameCount: number, tStart: string, tEnd: string, extra?: string) => {
      const header = `co-rotating coherence report | frames=${frameCount} | t0=${tStart} | t1=${tEnd} | coords: u=+E/right, v=+N/up (disk=unit circle)${extra ? ` | ${extra}` : ""}`;
      lines.push(header);
    };

    const addFrameReport = (label: string, tIso: string, gridSize: number, data: Float32Array) => {
      const stats = computeStats(data, gridSize);
      const p95 = stats.p95 ?? stats.max;
      const blobs = findHotspots(data, gridSize, p95);
      lines.push(`frame_t=${tIso}`);
      lines.push(`layer=${label} grid=${gridSize}`);
      lines.push(
        `stats: min=${stats.min.toFixed(3)} max=${stats.max.toFixed(3)} mean=${stats.mean.toFixed(3)} std=${stats.std.toFixed(3)} p80=${stats.p80?.toFixed(3) ?? "n/a"} p95=${stats.p95?.toFixed(3) ?? "n/a"} p99=${stats.p99?.toFixed(3) ?? "n/a"} power=${stats.power.toFixed(3)}`
      );
      if (blobs.length) {
        lines.push("hotspots(top5,p95+):");
        blobs.slice(0, 5).forEach((b) => {
          lines.push(
            `  - pk=${b.peak.toFixed(3)} area=${(b.areaFrac * 100).toFixed(2)}% centroid(u=${b.u.toFixed(3)},v=${b.v.toFixed(3)}) radius=${b.radius.toFixed(3)}`
          );
        });
      } else {
        lines.push("hotspots(top5,p95+): none");
      }
    };

    if (overlay) {
      const frameCount = overlay.frames.length;
      const tStart = frameCount ? new Date(overlay.frames[0].t).toISOString() : "n/a";
      const tEnd = frameCount ? new Date(overlay.frames[frameCount - 1].t).toISOString() : "n/a";
      addHeader(frameCount, tStart, tEnd);

      // Primary coherence report (aggregated map)
      addFrameReport("coherence", tStart, overlay.map.gridSize, overlay.map.coherence);

      // If user wants per-frame snapshots for the selected field, emit them (limited to avoid huge output).
      const maxFrames = Math.min(overlay.frames.length, 24); // keep report readable
      for (let i = 0; i < maxFrames; i++) {
        const f = overlay.frames[i];
        const tIso = new Date(f.t).toISOString();
        if (field === "intensity") {
          addFrameReport(`intensity/frame=${i + 1}`, tIso, f.gridSize, f.mapSun);
        } else if (field === "coherence") {
          addFrameReport(`coherence/frame=${i + 1}`, tIso, overlay.map.gridSize, overlay.map.coherence);
        } else if (field === "phaseDispersion") {
          addFrameReport(`phaseDispersion/frame=${i + 1}`, tIso, overlay.map.gridSize, overlay.map.phaseDispersion);
        } else if (field === "energy") {
          addFrameReport(`energy/frame=${i + 1}`, tIso, overlay.map.gridSize, overlay.map.energy);
        }
      }

      if (overlay.frames.length > Math.min(overlay.frames.length, 24)) {
        lines.push(`... truncated ${overlay.frames.length - Math.min(overlay.frames.length, 24)} additional frames for brevity`);
      }
    } else if (sunpyData?.frames?.length) {
      const frames = sunpyData.frames;
      const frameCount = frames.length;
      const tStart = new Date(frames[0].obstime).toISOString();
      const tEnd = new Date(frames[frameCount - 1].obstime).toISOString();
      const evtCount = sunpyData.events?.length ?? 0;
      addHeader(frameCount, tStart, tEnd, `HEK_events=${evtCount}`);

      const maxFrames = Math.min(frameCount, 24);
      for (let i = 0; i < maxFrames; i++) {
        const f = frames[i];
        if (!f.map_b64 || !f.grid_size) continue;
        const data = decodeFloat32(f.map_b64);
        const tIso = new Date(f.obstime).toISOString();
        addFrameReport(`sunpy_intensity/frame=${i + 1}`, tIso, f.grid_size, data);
      }
      if (frameCount > maxFrames) {
        lines.push(`... truncated ${frameCount - maxFrames} additional frames for brevity`);
      }

      if (evtCount) {
        lines.push(`hek_events=${evtCount}`);
        (sunpyData.events ?? []).slice(0, 12).forEach((ev, idx) => {
          const when = ev.start_time ?? ev.start ?? ev.end_time ?? ev.end ?? "n/a";
          lines.push(
            `  - ${idx + 1}. type=${ev.event_type ?? "EV"} when=${when} goes=${ev.goes_class ?? "n/a"} rho=${ev.rho ?? "n/a"} u=${ev.u ?? "--"} v=${ev.v ?? "--"}`,
          );
        });
        if ((sunpyData.events ?? []).length > 12) {
          lines.push(`  ... ${Math.max(0, (sunpyData.events ?? []).length - 12)} more events`);
        }
      }
    } else {
      setReport("");
      return;
    }

    setReport(lines.join("\n"));
  };

  const timeLabel = currentTimeIso ?? (currentFrame ? new Date(currentFrame.t).toISOString() : "Waiting for ingest");
  const killSwitchSeconds = Math.round((sunpyData?.debug?.timeout_ms ?? 180_000) / 1000);
  const sunpyReason = sunpyData?.reason ?? sunpyData?.debug?.reason ?? sunpyData?.meta?.reason ?? null;
  const sunpyFramesMissing = Boolean(sunpyData?.meta?.frames_missing ?? sunpyData?.debug?.frames_missing);
  const sunpyFramesMissingReason =
    sunpyData?.meta?.frames_missing_reason ?? sunpyData?.debug?.frames_missing_reason ?? null;
  const sunpyExporterTimedOut =
    sunpyReason === "timeout" ||
    (typeof sunpyData?.debug?.error === "string" && sunpyData.debug.error.toLowerCase().includes("timeout"));
  const sunpyFramesMissingReasonLabel = React.useMemo(() => {
    const reason = sunpyFramesMissingReason ?? sunpyReason;
    if (!reason) return "";
    if (reason === "no_results") return "archive returned zero records";
    if (reason === "no_valid_maps") return "fetched files but none decoded";
    if (reason === "no_frames_emitted" || reason === "no_frames_from_exporter") {
      return "exporter returned zero frames";
    }
    if (reason === "no_intensity_grids") return "frames lacked intensity grids";
    if (reason === "python_error") return "python bridge failed";
    if (reason === "timeout") return "python exporter timeout";
    if (reason === "no_aia_data") return "archive returned zero records";
    return String(reason);
  }, [sunpyFramesMissingReason, sunpyReason]);
  const totalFrames = sunpyData?.frames?.length ?? overlay?.frames?.length ?? 0;
  const corotatingSize = Math.max(256, Math.min(640, Math.min(canvasSize.width, canvasSize.height)));
  const observerOverlayActive = Boolean(observerGrid?.data) && !lockSun;
  const isIngesting = solarCoherenceMutation.isPending || status.toLowerCase().startsWith("ingesting");
  const sunpyNoDataMessage = "No AIA intensity data for this time range; showing HEK-only glyphs.";
  const sunpyTimeoutMessage = "SunPy exporter timed out; try a shorter window or raise SUNPY_TIMEOUT_MS.";
  const sunpyDebugDescription =
    sunpyExporterTimedOut
      ? sunpyTimeoutMessage
      : sunpyReason === "no_aia_data" || sunpyFramesMissingReason === "no_results"
        ? sunpyNoDataMessage
        : sunpyReason === "python_error"
          ? "SunPy exporter failed; showing HEK-only glyphs."
          : sunpyFramesMissing
            ? "SunPy exporter returned no frames; showing HEK-only glyphs."
            : "No SunPy intensity grid detected; showing fallback disk.";
  const sunpyDebugTip =
    sunpyExporterTimedOut
      ? sunpyTimeoutMessage
      : sunpyReason === "no_aia_data" || sunpyFramesMissingReason === "no_results"
        ? "No AIA frames came back for that window/wavelength. Try widening the window or switching channels (e.g., AIA 211)."
        : sunpyReason === "python_error"
          ? "Python bridge errored; check server logs and keep HEK-only glyphs visible."
          : sunpyFramesMissing
            ? "Exporter returned no frames; check the window/channel or server logs."
            : `Tip: set Max frames to 0 for instant HEK glyphs, or try a 5-10 minute window with maxFrames=1 and FL only. Kill switch is ~${killSwitchSeconds}s (override with SUNPY_TIMEOUT_MS).`;

  const showSolarSection = (id: string) => {
    const page: SolarWorkbenchPage = id === "solar-observe" || id === "solar-replay" ? "imagery"
      : id === "solar-events" ? "events"
      : id === "solar-diagnostics" ? "diagnostics"
      : id === "solar-report" ? "reports" : "research";
    setActivePage(page);
    window.requestAnimationFrame(() => {
      const target = document.getElementById(id) ??
        (id === "solar-compare-package" ? document.getElementById("solar-compare") : null);
      target?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <div className="space-y-4 p-4 text-slate-100">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Star Watcher</h1>
        <Badge className="bg-cyan-500/20 text-cyan-200 border border-cyan-400/40">Solar observation workbench</Badge>
        {overlay?.caption ? <Badge variant="secondary">Caption: {overlay.caption}</Badge> : null}
        <Badge className="bg-amber-500/10 text-amber-100 border border-amber-400/40">SunPy: {sunpyStatus}</Badge>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">{status}</span>
          {isIngesting ? (
            <div className="h-1 w-44 overflow-hidden rounded bg-slate-800">
              <div className="h-full w-1/2 animate-pulse rounded-r bg-cyan-400/70" />
            </div>
          ) : null}
        </div>
        <details ref={optionsMenuRef} className="relative rounded border border-slate-700 bg-slate-950/80 p-2">
          <summary className="cursor-pointer list-none text-sm text-slate-200" aria-label="Star Watcher options">⋮ <span className="sr-only">Star Watcher options</span></summary>
          <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded border border-slate-700 bg-slate-950 p-2 shadow-xl">
            <button type="button" className="block w-full rounded px-2 py-1 text-left text-xs text-cyan-100 hover:bg-slate-800" onClick={() => {
              optionsMenuRef.current?.removeAttribute("open");
              setActivePage("sources");
              window.requestAnimationFrame(() => document.getElementById("solar-source-access")?.scrollIntoView?.({ behavior: "smooth", block: "start" }));
            }}>Data sources &amp; access</button>
            <button type="button" className="block w-full rounded px-2 py-1 text-left text-xs text-cyan-100 hover:bg-slate-800" onClick={() => {
              optionsMenuRef.current?.removeAttribute("open");
              setLiveRefreshGeneration((value) => value + 1);
            }}>Refresh latest preview</button>
          </div>
        </details>
        <div className="ml-auto w-full max-w-xl">
          <details className="rounded border border-slate-800 bg-slate-950/80 p-2">
            <summary className="cursor-pointer text-xs text-slate-300">Advanced · ingest diagnostics ({debugLog.length})</summary>
            <div className="mt-2 flex items-center justify-between pb-1">
              <span className="text-[10px] uppercase tracking-wide text-slate-500">Ingest debug</span>
              <button
                type="button"
                onClick={() => setDebugLog([])}
                className="text-[10px] text-cyan-300 hover:text-cyan-200"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={sampleMemory}
                className="text-[10px] text-cyan-300 hover:text-cyan-200"
                title="Log JS heap usage to the debug feed"
              >
                Mem snapshot
              </button>
            </div>
            <div className="max-h-20 overflow-auto text-[11px] font-mono text-slate-200 leading-tight space-y-0.5">
              {debugLog.length ? (
                debugLog.map((line, idx) => <div key={idx}>{line}</div>)
              ) : (
                <div className="text-[10px] text-slate-500">No ingest log yet.</div>
              )}
            </div>
          </details>
        </div>
      </header>

      <div role="group" aria-label="Solar surface view" className="flex flex-wrap gap-2">
        <Button size="sm" variant={surfaceView === "disk" ? "default" : "outline"} aria-pressed={surfaceView === "disk"} onClick={() => setSurfaceView("disk")}>Solar disk</Button>
        <Button size="sm" variant={surfaceView === "magnetic-globe" ? "default" : "outline"} aria-pressed={surfaceView === "magnetic-globe"} onClick={() => setSurfaceView("magnetic-globe")}>3D magnetic globe</Button>
        <Button size="sm" variant={surfaceView === "graphs" ? "default" : "outline"} aria-pressed={surfaceView === "graphs"} onClick={() => setSurfaceView("graphs")}>Graphs & timing</Button>
        {surfaceView === 'magnetic-globe' && <Button size="sm" variant="outline" onClick={() => {
          setActivePage('sources');
          window.requestAnimationFrame(() => document.getElementById('solar-source-access')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
        }}>Find magnetic data</Button>}
      </div>
      {surfaceView === "magnetic-globe" ? <div>
        {selectedEventId && <p className="mb-2 text-xs text-amber-200">Selected event {selectedEventId}: no WCS-validated positional link from the current image to this globe. Any HEK marker is independent catalog context, not an inferred image location.</p>}
        <React.Suspense fallback={<p className="text-xs text-slate-400">Loading 3D magnetic globe…</p>}><SolarMagneticGlobe acquisitionId={magneticAcquisitionId} hmiAcquisitionId={hmiMagneticAcquisitionId}
          catalogEvents={activeSunpyEvents} selectedCatalogEventId={selectedEventId} onCatalogEventSelect={handleEventSelect} /></React.Suspense>
      </div> : surfaceView === "graphs" ? <section aria-label="Solar graphs and timing" className="space-y-3 rounded-xl border border-cyan-700/40 bg-slate-950/80 p-4">
        <h2 className="text-lg font-semibold text-slate-100">Graphs & timing</h2>
        {sunpyData?.frames?.length ? <>
          <SolarEvidenceTimeline frames={sunpyData.frames} currentFrameIndex={frameIndex}
            goesBins={sunpyData.goes_xrs?.bins ?? sunpyData.selected_goes_window?.bins.map(bin=>({
              start:bin.startUtc,end:bin.endUtc,mean_long:bin.meanLongWm2}))}
            events={sunpyData.events.length ? sunpyData.events : sunpyData.selected_event_context ? [{
              id:sunpyData.selected_event_context.eventId,event_type:sunpyData.selected_event_context.eventType,
              start_time:sunpyData.selected_event_context.eventStartUtc,
              end_time:sunpyData.selected_event_context.eventEndUtc ?? undefined}] : []}
            onFrameSelect={setFrameIndex} />
          <p className="text-xs text-slate-400">Selected event: {selectedEventId ?? 'none'} · frame: {currentSunpyFrame?.obstime ?? 'unavailable'} · retained selection: {sunpyData.archive_identity?.snapshotId ?? 'save a snapshot for an exact ID'}.</p>
        </> : <p className="text-sm text-slate-400">Load or replay a time-stamped SunPy observation to align image frames, GOES XRS and HEK event intervals. The latest browse image has no verified exposure time.</p>}
      </section> : <section aria-label="Solar disk and imagery" className="grid gap-4 rounded-xl border border-cyan-700/40 bg-slate-950/80 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(250px,0.65fr)]">
        <div className="space-y-3">
        {registeredView ? <SolarRegisteredRegionDisplay
          image={registeredView.image} report={registeredView.report}
          regions={registeredView.regions.map(region => ({
            noaaNumber: region.noaaNumber, location: region.location, category: region.category,
            spotCount: region.spotCount, spotClass: region.spotClass, magneticClass: region.magneticClass,
            pixelX: region.xPx, pixelY: region.yPx, visible: region.visible,
            omissionReason: region.omissionReason,
          }))}
          projectionLabel={`NOAA report locations projected at fixed Carrington longitude; report-to-image offset ${(registeredView.registration.timeDeltaSeconds / 3600).toFixed(1)} hours.${Math.abs(registeredView.registration.timeDeltaSeconds) > 6 * 3600 ? " This large time offset makes each marker coarse context, not an exact region boundary." : ""} HMI QUALITY ${registeredView.wcs.qualityFlag} is a raw image flag, not science admission.`}
          onRefresh={() => setRegisteredRefreshGeneration(generation => generation + 1)}
          onImageError={() => {
            setRegisteredReceipt(null);
            setRegisteredStatus("The exact registered image is no longer available. Labels were removed; retry the image/report registration.");
          }}
          onExit={() => setRegisteredMode(false)} /> : <>
        <div className="grid min-h-56 place-items-center overflow-hidden rounded-lg border border-slate-800 bg-black p-3">
          {sunpyIntensityGrid ? (
            <SolarObservationRaster data={sunpyIntensityGrid.data} size={sunpyIntensityGrid.gridSize} />
          ) : !sunpyData && livePreview ? (
            <img src={livePreview.imageUrl} alt={`${livePreview.label} browse image from ${livePreview.source}`}
              className="h-full w-full max-w-md object-contain" onError={() => {
                setLivePreview(null);
                setLivePreviewStatus("Preview image expired; refresh the latest feed.");
              }} />
          ) : corotatingGrid ? (
            <SolarDiskCanvas mode="corotating" width={corotatingSize} height={corotatingSize}
              mapSun={stretchedGridData ?? corotatingGrid.data} gridSize={corotatingGrid.gridSize}
              events={activeEventGlyphs} onEventClick={handleEventSelect} onEventHover={handleEventHover}
              className="h-full w-full max-w-md" />
          ) : (
            <div className="flex flex-col items-center gap-3 text-center">
              <div aria-hidden="true" className="h-40 w-40 rounded-full bg-gradient-to-br from-amber-300 via-amber-500 to-orange-800 shadow-[0_0_40px_rgba(245,158,11,0.2)]" />
              <p className="text-xs text-slate-400">{sunpyData ? "Catalog-only disk · no observed image loaded" : "Illustrative disk · no observed image loaded"}</p>
            </div>
          )}
        </div>
        {!sunpyData && <div role="group" aria-label="Solar browse channels" className="flex flex-wrap gap-2">
          <Button size="sm" variant={liveChannel === "hmiContinuum" ? "default" : "outline"}
            aria-pressed={liveChannel === "hmiContinuum"} onClick={() => { setRegisteredMode(false); setLiveChannel("hmiContinuum"); }}>Sunspot intensitygram</Button>
          <Button size="sm" variant={liveChannel === "hmiMag" ? "default" : "outline"}
            aria-pressed={liveChannel === "hmiMag"} onClick={() => { setRegisteredMode(false); setLiveChannel("hmiMag"); }}>Whole-disk magnetogram</Button>
        </div>}
        {!sunpyData && (liveChannel === "hmiContinuum" || liveChannel === "hmiMag") && <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
          <Button type="button" size="sm" variant="outline" disabled={registeredBusy}
            onClick={() => registeredMode ? setRegisteredRefreshGeneration(generation => generation + 1) : setRegisteredMode(true)}>
            {registeredBusy ? "Registering NOAA positions…" : registeredMode ? "Retry registered labels" : "Show registered NOAA labels"}
          </Button>
          {registeredMode && <Button type="button" size="sm" variant="ghost" onClick={() => setRegisteredMode(false)}>Cancel registered view</Button>}
          <span>Uses an exact Helioviewer HMI image, not the latest browse image shown above.</span>
        </div>}
        {registeredMode && registeredStatus && <p role="status" className="text-xs text-amber-200">{registeredStatus}</p>}
        {!sunpyData ? <SolarActiveRegionCatalog onShowMagnetogram={() => { setRegisteredMode(false); setLiveChannel("hmiMag"); }} /> :
          <p className="text-xs text-slate-400">Current NOAA daily regions are hidden during observation replay. Use the event catalog and the selected frame’s own time window for this record.</p>}
        </>}
        </div>
        <div className="flex flex-col justify-center gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-cyan-300">Solar surface</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-100">Start with the disk</h2>
            <p className="mt-2 text-sm text-slate-400">Select an image, then inspect reported events and their source records. Interior models and derived diagnostics remain separate workspaces.</p>
          </div>
          <div className="space-y-1 text-xs text-slate-300">
            <p>{registeredView ? `Helioviewer HMI ${registeredView.image.channel === "hmiMag" ? "magnetogram" : "intensitygram"} · exact registered image` : sunpyData && !currentSunpyFrame ? "HEK event catalog · no image frame" : sunpyData ? `${sunpyData.instrument} ${sunpyData.wavelength_A} Å · ${currentSunpyFrame?.obstime ?? "time unavailable"}` : livePreview ? `${livePreview.label} · ${livePreview.source} browse preview` : "No observation selected"}</p>
            <p>{registeredView ? `Observed ${registeredView.image.observationAt}; NOAA report positions valid ${registeredView.report.validAt}. Markers are approximate projections, not sunspot pixel detections.` : sunpyData && !currentSunpyFrame ? "Catalog-only result. The latest browse preview is hidden because it is not an image of this search window." : sunpyData?.meta?.source === "imported_observation_replay" ? "Archive replay · not live" : sunpyData ? "Loaded observation · inspect acquisition metadata" : livePreview ? `${livePreview.stale ? "Stale source" : livePreview.sourceId === "sdo" ? "Preferred source" : livePreview.sourceId === "helioviewer-hmi" || livePreview.sourceId === "helioviewer-hmi-mag" ? "HMI alternate source" : "Fallback EUV source"} · ${livePreview.observationAt ? `observed ${livePreview.observationAt}` : `published ${livePreview.upstreamLastModifiedAt ?? "time unknown"} · observation time not verified`}` : livePreviewStatus}</p>
            <p>{sunpyData?.events?.length ?? 0} catalog events in current payload{researchObservationArchive?.selected_event_context ? " · 1 selected event/frame" : ""}{researchObservationArchive?.selected_goes_window ? ` · ${researchObservationArchive.selected_goes_window.bins.length} aligned GOES bins` : ""}</p>
          </div>
          <div className="rounded border border-slate-800 bg-slate-900/60 p-2 text-xs text-slate-300">
            <p className="font-medium text-slate-100">Image feed</p>
            <p>{sunpyForm.instrument} {sunpyForm.wavelength} Å selected for the next search. This does not change an already loaded image.</p>
            <button type="button" onClick={() => showSolarSection("solar-observe")} className="mt-1 text-cyan-200 underline">Choose channel and time window</button>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <Button size="sm" variant="outline" aria-label="Previous solar frame" disabled={!totalFrames || frameIndex <= 0} onClick={() => setFrameIndex(index => Math.max(0, index - 1))}>←</Button>
            <span>Frame {totalFrames ? `${frameIndex + 1} of ${totalFrames}` : "unavailable"}</span>
            <Button size="sm" variant="outline" aria-label="Next solar frame" disabled={!totalFrames || frameIndex >= totalFrames - 1} onClick={() => setFrameIndex(index => Math.min(totalFrames - 1, index + 1))}>→</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setActivePage("imagery")}>Browse imagery</Button>
            <Button size="sm" variant="outline" onClick={() => setActivePage("events")}>Inspect events</Button>
          </div>
          <p className="text-[11px] text-amber-200">{registeredView ? "Exact HMI browse image with geometrically projected NOAA daily report locations. Neither image nor markers are a calibrated vector magnetic measurement or a 3D reconstruction." : !sunpyData && livePreview ? `${livePreview.source} browse image${livePreview.sourceId === "helioviewer-hmi" ? " (Helioviewer-rendered HMI intensitygram)" : livePreview.sourceId === "helioviewer-hmi-mag" ? " (Helioviewer-rendered HMI line-of-sight magnetogram)" : livePreview.sourceId === "sdo" ? "" : " (SUVI EUV context, not an AIA-equivalent measurement)"}. Not calibrated science data, a saved observation, or a 3D magnetic reconstruction.` : "Display-normalized image or diagnostic overlay; not calibrated radiance or a 3D magnetic reconstruction."}</p>
        </div>
      </section>}

      <nav id="solar-directory" aria-label="Star Watcher directory" className="rounded border border-slate-800 bg-slate-950/70 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Explore Star Watcher</p>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {SOLAR_WORKBENCH_PAGES.map(page => (
            <button key={page.id} type="button" aria-current={activePage === page.id ? "page" : undefined}
              onClick={() => setActivePage(page.id)}
              className={`rounded border p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 ${activePage === page.id
                ? "border-cyan-400/70 bg-cyan-500/10" : "border-slate-700 bg-slate-900/70 hover:border-cyan-400/60"}`}>
              <span className="block text-sm font-medium text-cyan-100">{page.label}</span>
              <span className="mt-1 block text-xs text-slate-400">{page.description}</span>
            </button>
          ))}
        </div>
      </nav>

      <section id="solar-source-access" hidden={activePage !== "sources"} aria-label="Data sources and access" className={activePage === "sources" ? "space-y-3 rounded border border-slate-800 bg-slate-950/70 p-3" : "hidden"}>
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Data sources &amp; access</h2>
          <p className="mt-1 text-xs text-slate-400">Public browse feeds load without a provider login. Researcher connections are scoped to the signed-in session; neither this page nor MCP returns provider secrets.</p>
        </div>
        <SolarMagneticArchiveDirectory gongAcquisitionId={magneticAcquisitionId}
          onOpenGongMap={id=>{setMagneticAcquisitionId(id);setHmiMagneticAcquisitionId(null);setSurfaceView('magnetic-globe');setActivePage('surface');}}
          onCompareHmi={id=>{setHmiMagneticAcquisitionId(id);setSurfaceView('magnetic-globe');setActivePage('surface');}} />
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded border border-slate-700 bg-slate-900/60 p-3 text-xs">
            <h3 className="text-sm font-medium text-slate-100">Solar browse preview · compatible SDO alternatives</h3>
            <label className="mt-2 block text-slate-300" htmlFor="sdo-live-channel">Solar disk channel</label>
            <select id="sdo-live-channel" value={liveChannel} onChange={(event) => setLiveChannel(event.target.value as SdoLiveChannel)}
              className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2 text-slate-100">
              <option value="hmiContinuum">HMI continuum (sunspots)</option>
              <option value="aia193">AIA 193 Å</option>
              <option value="aia171">AIA 171 Å</option>
              <option value="hmiMag">HMI magnetogram</option>
            </select>
            <p className="mt-2 text-slate-300" role="status">{livePreviewStatus}</p>
            {livePreview ? <div className="mt-2 space-y-1 text-slate-400">
              <p>Retrieved: {livePreview.retrievedAt}</p>
              <p>Selected source: {livePreview.source} · {livePreview.selectionReason.replaceAll("_", " ")}</p>
              <p>Upstream file modified: {livePreview.upstreamLastModifiedAt ?? "not provided"}</p>
              <p>Observation time: {livePreview.observationAt ?? "not verified from this browse image"}</p>
              <p className="break-all font-mono">SHA-256: {livePreview.sha256}</p>
              <a href={livePreview.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-200 underline">Open original browse image</a>
              <p>{livePreview.sourceId === "sdo" ? "Courtesy of NASA/SDO and the AIA, EVE, and HMI science teams." :
                livePreview.sourceId === "helioviewer-hmi" || livePreview.sourceId === "helioviewer-hmi-mag" ?
                  "NASA/SDO HMI source image rendered by Helioviewer; this JPEG is a browse product, not calibrated FITS." :
                "Source: NOAA/SWPC SUVI. The primary/secondary role may change spacecraft; no spacecraft identity is inferred here."}</p>
            </div> : null}
            <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => setLiveRefreshGeneration((value) => value + 1)}>Refresh preview</Button>
            <p className="mt-2 text-amber-200">Browse imagery is for orientation, not calibrated analysis or a model–observation residual.</p>
          </div>
          <div className="rounded border border-slate-700 bg-slate-900/60 p-3 text-xs">
            <h3 className="text-sm font-medium text-slate-100">JSOC researcher access</h3>
            <p className="mt-1 text-slate-400">A registered JSOC notification email is used by the existing SunPy workflow. When you turn off “Images only” for a search, the exporter may request JSOC SHARP and cutout data using this address. This does not verify registration or grant redistribution rights.</p>
            <p className="mt-2 text-slate-300">{jsocConnection?.connected ? `Connected for this server session: ${jsocConnection.maskedEmail}` : "No personal JSOC email connected for this session."}</p>
            <label className="mt-2 block text-slate-300" htmlFor="jsoc-session-email">Registered JSOC email</label>
            <input id="jsoc-session-email" type="email" autoComplete="email" value={jsocEmailInput}
              onChange={(event) => setJsocEmailInput(event.target.value)}
              className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2 text-slate-100" />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={jsocConnectionBusy || !jsocEmailInput.trim()} onClick={() => void updateJsocConnection("connect")}>Connect for session</Button>
              <Button type="button" size="sm" variant="outline" disabled={jsocConnectionBusy || !jsocConnection?.connected} onClick={() => void updateJsocConnection("disconnect")}>Disconnect</Button>
            </div>
            {jsocConnectionMessage ? <p className="mt-2 text-slate-300" role="status">{jsocConnectionMessage}</p> : null}
            <p className="mt-2 text-amber-200">Session-only: the server forgets this address after restart or expiry. API keys and persistent provider credentials are not accepted here until the encrypted connection store is ready.</p>
          </div>
        </div>
      </section>

      <section hidden={activePage !== "explore"} aria-label="Solar specialist tools" className={activePage === "explore" ? "rounded border border-slate-800 bg-slate-950/70 p-3" : "hidden"}>
        <h2 className="text-sm font-semibold text-slate-100">Models & concepts</h2>
        <p className="mt-1 text-xs text-slate-400">These are standalone research tools, not connected model adapters. The canonical solar sphere indexes observed, projected and modeled layers separately; opening a concept panel does not feed it that scene or validate its output.</p>
        <div className="mt-3 space-y-4">
          {SOLAR_SPECIALIST_SECTIONS.map(section=><section key={section} aria-label={section} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-cyan-200">{section}</h3>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {SOLAR_SPECIALIST_PANELS.filter(panel=>panel.section===section).map(panel=><div key={panel.id} className="rounded border border-slate-700 bg-slate-900/60 p-3">
                <p className="text-[11px] uppercase tracking-wide text-amber-200">{panel.kind}</p>
                <h4 className="mt-1 text-sm font-medium text-slate-100">{panel.title}</h4>
                <p className="mt-1 text-xs text-slate-400">{panel.description}</p>
                <p className="mt-2 break-all font-mono text-[10px] text-slate-400">{panel.pluginId} · v{panel.version} · {panel.maturity.replaceAll('_',' ')}</p>
                <p className="mt-2 text-[11px] text-slate-300">Input: {panel.inputStatus}</p>
                <p className="text-[11px] text-slate-300">Output: {panel.outputContract}</p>
                <p className="text-[11px] text-amber-200">Scene binding: {panel.sceneBinding}</p>
                <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => openSpecialistPanel(panel.id)}>Open {panel.title}</Button>
              </div>)}
            </div>
          </section>)}
        </div>
      </section>

      <section hidden={activePage !== "research"} aria-label="Build an event evidence package" className={`${activePage === "research" ? "" : "hidden"} rounded border border-cyan-700/40 bg-slate-950/70 p-3 text-xs space-y-2`}>
        <h2 className="text-sm font-semibold text-slate-100">Research path · event to evidence package</h2>
        <p className="text-slate-400">Follow these controls in order. The image, event report and interior record retain separate identities; packaging them does not establish a physical relationship.</p>
        <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {id:solarRuntime?.available===false?'solar-replay':'solar-observe',
              label:solarRuntime?.available===false?'1 · Reopen an observation':'1 · Load SunPy observation',
              state:sunpyData?.frames?.length?'Image frames loaded':sunpyData?'No image frames in current response':
                solarRuntime?.available===false?'Packaged SunPy unavailable; local replay is available':'No observation loaded',
              action:solarRuntime?.available===false?'Open local replay':'Open observation search'},
            {id:'solar-events',label:'2 · Select HEK event and frame',state:researchObservationArchive?.selected_event_context?'Bounded selection ready':'No event/frame selection',action:'Open event inspector'},
            {id:'solar-research-catalog',label:'3 · Choose comparison input',state:'Observed rows and model inputs are distinct',action:'Inspect local and retained records'},
            {id:'solar-compare-package',label:'4 · Prepare and retain package',state:'Verify package before owner retention or MCP read',action:'Open package controls'},
          ].map(step=><li key={step.id} className="rounded border border-slate-700 bg-slate-900/60 p-2 space-y-1">
            <p className="font-medium text-cyan-100">{step.label}</p>
            <p className="text-slate-400">{step.state}</p>
            <button type="button" onClick={()=>showSolarSection(step.id)} className="text-cyan-200 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">{step.action}</button>
          </li>)}
        </ol>
      </section>

      {activePage === 'research'&&<React.Suspense fallback={<p className="text-xs text-slate-400">Loading stellar scene context…</p>}>
        <StellarSceneContext/>
      </React.Suspense>}

      <div hidden={activePage !== "research"} className={activePage === "research" ? "" : "hidden"}>
        <SolarResearchWorkbenchCatalog observationLoaded={sunpyData !== null && sunpyData !== undefined}
          onOpenRecord={recordId => { setSelectedLocalResearchBundle(null); setSelectedResearchRecordId(recordId); showSolarSection("solar-compare"); }}
          onOpenLocalRecord={bundle => { setSelectedResearchRecordId(undefined); setSelectedLocalResearchBundle(bundle); showSolarSection("solar-compare"); }} />
      </div>

      <div className="grid min-w-0 gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))" }}>
        <div hidden={activePage !== "imagery" && activePage !== "reports"} className={activePage === "imagery" || activePage === "reports" ? "min-w-0 space-y-4" : "hidden"}>
          <Card id="solar-observe" className={`${activePage === "imagery" ? "" : "hidden"} bg-slate-900/60 border-slate-800`}>
            <CardHeader className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <img src={sunpyIconUrl} alt="SunPy" className="h-7 w-7 rounded bg-slate-950 p-1" />
                <div>
                  <CardTitle>SunPy / HEK Search</CardTitle>
                  <CardDescription>Pull AIA imagery + HEK events and overlay them on the Star Watcher canvas.</CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="w-fit border-amber-500/40 text-amber-100">
                {sunpyStatus}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={sunpyImagesOnly} onChange={e => setSunpyImagesOnly(e.target.checked)} />
                Images only (skip event and auxiliary downloads)
              </label>
              <p className="text-xs text-slate-400">{solarRuntime === null ? "Solar runtime capability not yet confirmed" :
                solarRuntime.available ? "Solar Python runtime available; archive connectivity is checked separately" :
                "Python/SunPy or packaged script assets unavailable — use local snapshot replay"}</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Start (UTC)</Label>
                  <Input
                    value={sunpyForm.start}
                    onChange={(e) => setSunpyForm({ ...sunpyForm, start: e.target.value })}
                    placeholder="2025-09-25T18:00:00"
                  />
                </div>
                <div>
                  <Label>End (UTC)</Label>
                  <Input
                    value={sunpyForm.end}
                    onChange={(e) => setSunpyForm({ ...sunpyForm, end: e.target.value })}
                    placeholder="2025-09-25T19:00:00"
                  />
                </div>
              </div>
              <details className="rounded border border-slate-800 bg-slate-950/60 p-2">
                <summary className="cursor-pointer text-xs text-cyan-100">
                  Source and event options · {sunpyForm.instrument} {sunpyForm.wavelength} Å · {sunpyForm.maxFrames} frame(s)
                </summary>
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Instrument</Label>
                      <select
                        className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100"
                        value={sunpyForm.instrument}
                        onChange={(e) => setSunpyForm({ ...sunpyForm, instrument: e.target.value })}
                      >
                        <option value="AIA">AIA</option>
                        <option value="SUVI">SUVI</option>
                        <option value="HMI">HMI</option>
                      </select>
                    </div>
                    <div>
                      <Label>Wavelength (A)</Label>
                      <Input value={sunpyForm.wavelength} onChange={(e) => setSunpyForm({ ...sunpyForm, wavelength: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Max frames</Label>
                      <Input type="number" min={0} max={40} value={sunpyForm.maxFrames}
                        onChange={(e) => setSunpyForm({ ...sunpyForm, maxFrames: Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 3 })} />
                    </div>
                    <div className="flex flex-col">
                      <Label>Event types</Label>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {["FL", "AR", "CH", "CE", "CJ", "EF"].map((type) => (
                          <label key={type} className="flex items-center gap-1 text-xs text-slate-200">
                            <input type="checkbox" checked={Boolean(sunpyEventTypes[type])}
                              onChange={(e) => setSunpyEventTypes((prev) => ({ ...prev, [type]: e.target.checked }))} />
                            {type}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-950/60 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Quick presets</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={applyHekOnlyPreset} disabled={sunpyLoading}>HEK-only (maxFrames=0)</Button>
                      <Button variant="outline" size="sm" onClick={applySunpyProbePreset} disabled={sunpyLoading}>SunPy probe (10m, 1 frame, FL)</Button>
                      <Button variant="outline" size="sm" onClick={runSunpyPreflight} disabled={sunpyLoading || !sunpyProbeAllowed(solarRuntime, sunpyForm.maxFrames)}>Refresh preflight</Button>
                    </div>
                    <p className="mt-1 text-[11px] text-amber-200">Kill switch ~{killSwitchSeconds}s (env SUNPY_TIMEOUT_MS). Use HEK-only or shorten window if SunPy stalls.</p>
                  </div>
                </div>
              </details>
              <div className="rounded border border-slate-800 bg-slate-950/60 p-2">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-500">
                  <span>SunPy availability probe</span>
                  <Badge
                    variant="outline"
                    className={
                      sunpyPreflight?.reason === "ok"
                        ? "border-emerald-400/40 text-emerald-200"
                        : "border-amber-400/40 text-amber-100"
                    }
                  >
                    {sunpyPreflight?.reason ?? "pending"}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-slate-200">{sunpyPreflightStatus}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                  <span>frames: {sunpyPreflight?.available_frames ?? 0}</span>
                  <span>tables: {sunpyPreflight?.tables ?? 0}</span>
                  {sunpyPreflight?.fallback_applied ? (
                    <span>{`fallback: ${sunpyPreflight.fallback_start ?? "?"} -> ${sunpyPreflight.fallback_end ?? "?"}`}</span>
                  ) : sunpyPreflight?.fallback_attempted ? (
                    <span>{`fallback tried: ${sunpyPreflight.fallback_start ?? "?"} -> ${sunpyPreflight.fallback_end ?? "?"}`}</span>
                  ) : null}
                  {sunpyPreflight?.timestamp_utc ? <span>at: {sunpyPreflight.timestamp_utc}</span> : null}
                  <span className="ml-auto text-[10px] uppercase text-slate-500">preflight=1</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={loadSunpyData} disabled={sunpyLoading || preflightBlocksFetch}>
                  {sunpyLoading ? "Loading SunPy..." : "Load SunPy + HEK"}
                </Button>
                <Button variant="outline" disabled={!sunpyLoading} onClick={() => sunpyRequest.current?.abort()}>
                  Cancel solar download
                </Button>
                <span className="text-[11px] text-slate-400">
                  Frames: {sunpyData?.frames?.length ?? 0} | Events: {sunpyData?.events?.length ?? 0}
                </span>
                {preflightBlocksFetch ? (
                  <span className="text-[11px] text-amber-200">
                    Preflight: archive returned no frames; set maxFrames=0 for HEK-only or adjust window/channel.
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
                {Object.entries(sunpyEventCounts).map(([key, count]) => (
                  <Badge key={key} variant="outline" className="border-slate-700 text-slate-200">
                    {key}: {count}
                  </Badge>
                ))}
              </div>
              <p className="text-[11px] text-slate-500">
                This path keeps the GIF-based coherence pipeline intact; SunPy adds event glyphs + a time base for the slider.
              </p>
            </CardContent>
          </Card>

          <Card id="solar-report" className={`${activePage === "reports" ? "" : "hidden"} bg-slate-900/60 border-slate-800`}>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>GPT Report (co-rotating)</CardTitle>
                <CardDescription>Compact, copyable text summary of the current overlay.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={generateReport} disabled={!overlay}>
                  Generate report
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => report && navigator.clipboard?.writeText(report)}
                  disabled={!report}
                >
                  Copy
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <textarea
                className="w-full rounded border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-100"
                rows={14}
                readOnly
                value={report}
                placeholder="Generate to populate a GPT-ready report of the co-rotating coherence layer (hotspots, stats, percentiles)."
              />
            </CardContent>
          </Card>
        </div>

        <div hidden={activePage !== "surface" && activePage !== "imagery" && activePage !== "research"} className={activePage === "surface" || activePage === "imagery" || activePage === "research" ? "min-w-0 space-y-4" : "hidden"}>
          <Card className="bg-slate-900/60 border-slate-800">
            <CardHeader>
              <CardTitle>{activePage === "research" ? "Interior comparison workspace" : activePage === "imagery" ? "Observation archive and image handling" : "Solar disk views"}</CardTitle>
              <CardDescription>
                {activePage === "research" ? "Observed inversion rows, candidate model inputs and evidence packages remain distinct." :
                  activePage === "imagery" ? "Reopen and inspect image provenance before using an observation." :
                  "Observer and co-rotating diagnostic canvases. Catalog glyphs require a selected event."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div id="solar-compare" className={activePage === "research" ? "" : "hidden"}><SolarProfileComparison observationArchive={researchObservationArchive} selectedRecordId={selectedResearchRecordId} selectedLocalBundle={selectedLocalResearchBundle} /></div>
              <div className={activePage === "imagery" ? "" : "hidden"}><SolarCacheManager /></div>
              <section id="solar-replay" className={`${activePage === "imagery" ? "" : "hidden"} space-y-2 rounded border border-slate-700 p-3`}>
                <p className="text-xs text-slate-400">The selected observation survives panel navigation in renderer memory (maximum 8 MB), not app restart. This is not a saved archive or a fresh acquisition. Account-policy changes clear it.</p>
                <Button disabled={!sunpyData} onClick={()=>{
                  observationOwnership.current.begin();snapshotSaveAttempt.current++;
                  sunpyRequest.current?.abort();sunpyRequest.current=null;setSunpyLoading(false);
                  setSunpyData(null);setReplayStatus("");setFrameIndex(0);
                  setReport("");
                  setSelectedEventId(null);setHoverEventId(null);
                  setSunpyStatus("Loaded observation cleared from renderer memory.");
                }}>Clear loaded observation</Button>
                <Label htmlFor="solar-observation-replay">Replay observation JSON (local file, maximum 8 MB)</Label>
                <Input id="solar-observation-replay" type="file" accept=".json,application/json"
                  onChange={async event => {
                    const input = event.currentTarget;
                    if(!input.files?.[0])return;
                    const selectedObservation=observationOwnership.current.begin();
                    sunpyRequest.current?.abort();sunpyRequest.current=null;setSunpyLoading(false);
                    setReplayStatus('Validating selected archive; previous observation retained.');
                    setSunpyStatus('Archive import selected; previous network request stopped.');
                    try {
                      const snapshot = await readObservationReplayInput(input);
                      if(!observationOwnership.current.isCurrent(selectedObservation))return;
                      setSunpyData(snapshot);
                      setFrameIndex(snapshot.selected_event_context?.selectedFrameIndex ?? snapshot.selected_goes_window?.selectedFrameIndex ?? 0);
                      setSelectedEventId(snapshot.selected_event_context?.eventId ?? null);setHoverEventId(null);
                      setReplayStatus("ARCHIVE REPLAY — display hashes verified; source FITS hashes declared, not independently authenticated.");
                      setSunpyStatus('Archive replay loaded; no live acquisition implied.');
                    } catch (error) {
                      if(!observationOwnership.current.isCurrent(selectedObservation))return;
                      setReplayStatus(`Replay rejected; previous observation retained: ${error instanceof Error ? error.message : "Invalid snapshot"}`);
                    }
                  }} />
                <Button disabled={!sunpyData} onClick={async () => {
                  if (!sunpyData) return;
                  const selectedObservation=observationOwnership.current.current();
                  const attempt=++snapshotSaveAttempt.current;
                  try {
                    const receipt=await exportObservationSnapshot(researchObservationArchive ?? sunpyData, window.casimirDesktop);
                    if(observationOwnership.current.isCurrent(selectedObservation) && snapshotSaveAttempt.current===attempt)setReplayStatus(receipt);
                  } catch (error) {
                    if(!observationOwnership.current.isCurrent(selectedObservation) || snapshotSaveAttempt.current!==attempt)return;
                    setReplayStatus(`Snapshot not saved: ${error instanceof Error ? error.message : 'Invalid observation'}`);
                  }
                }}>Save observation snapshot</Button>
                <p role="status" className="text-xs text-amber-200">{replayStatus}</p>
                {sunpyData?.archive_identity && <p className="text-xs break-all text-slate-400">Verified archive identity: {sunpyData.archive_identity.snapshotId} · recipe {sunpyData.archive_identity.processingRecipe}. Content integrity only; source FITS not included or authenticated.</p>}
              </section>
              {sunpyIntensityGrid ? (
                <section className={`${activePage === "imagery" ? "" : "hidden"} space-y-2 rounded border border-slate-700 p-3`}>
                  <Label>Observed {sunpyData?.instrument} {sunpyData?.wavelength_A} Å — {currentSunpyFrame?.obstime}</Label>
                  <SolarObservationRaster data={sunpyIntensityGrid.data} size={sunpyIntensityGrid.gridSize} />
                  <SolarObservationFreshness acquiredAt={currentSunpyFrame?.obstime} fetchedAt={sunpyData?.meta?.fetched_at_utc}
                    replay={sunpyData?.meta?.source==='imported_observation_replay'} />
                  <SolarObservationProcessing frame={currentSunpyFrame} />
                  <p className="text-xs text-slate-400">Native pixel grid, display-normalized. Not co-rotated, not a simulated Sun, and not calibrated radiance. Event registration requires WCS mapping.</p>
                  {sunpyData?.frames?.length ? <SolarSurfaceRegistrationViewer frames={sunpyData.frames} selectedFrameIndex={frameIndex}/> : null}
                </section>
              ) : null}
              {sunpyData?.frames?.length ? <div className={activePage === "imagery" ? "" : "hidden"}>
                <SolarEvidenceTimeline frames={sunpyData.frames} currentFrameIndex={frameIndex}
                  goesBins={sunpyData.goes_xrs?.bins ?? sunpyData.selected_goes_window?.bins.map(bin=>({
                    start:bin.startUtc,end:bin.endUtc,mean_long:bin.meanLongWm2}))}
                  events={sunpyData.events.length ? sunpyData.events : sunpyData.selected_event_context ? [{
                    id:sunpyData.selected_event_context.eventId,event_type:sunpyData.selected_event_context.eventType,
                    start_time:sunpyData.selected_event_context.eventStartUtc,
                    end_time:sunpyData.selected_event_context.eventEndUtc ?? undefined}] : []}
                  onFrameSelect={setFrameIndex} />
                {sunpyData.meta?.source==='imported_observation_replay' && <p className="mt-1 text-xs text-amber-200">Replay includes only the selected HEK assertion and bounded GOES window; it is not a full catalog or source time series.</p>}
              </div> : null}
              <div className={activePage === "surface" ? "space-y-4" : "hidden"}>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Observer view (matches the feed)</Label>
                  <div
                    className="relative w-full overflow-hidden rounded-lg border border-slate-800 bg-black"
                    style={{ aspectRatio: `${canvasSize.width}/${canvasSize.height}` }}
                  >
                    <video
                      key={videoSrc?.url ?? "solar-feed"}
                      ref={videoRef}
                      src={videoSrc?.url}
                      className="absolute inset-0 h-full w-full object-contain"
                      aria-label="Solar EUV video feed"
                      controls={false}
                      controlsList="nodownload noplaybackrate noremoteplayback"
                      disablePictureInPicture
                    />
                    {observerOverlayActive && currentFrame && currentHotspots.length ? (
                      <HotspotOverlay
                        canvasWidth={canvasSize.width}
                        canvasHeight={canvasSize.height}
                        diskGeom={currentFrame.diskGeom}
                        hotspots={currentHotspots}
                      />
                    ) : null}
                    {observerOverlayActive && observerGrid ? (
                      <SolarDiskCanvas
                        mode="observer"
                        width={canvasSize.width}
                        height={canvasSize.height}
                        mapSun={stretchedObserverData ?? observerGrid.data}
                        gridSize={observerGrid.gridSize}
                        diskGeom={observerGrid.diskGeom}
                        events={activeEventGlyphs}
                        onEventClick={handleEventSelect}
                        onEventHover={handleEventHover}
                        className="absolute inset-0 h-full w-full mix-blend-screen opacity-90"
                      />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center text-xs text-slate-500 pointer-events-none">
                        {lockSun ? "Lock to Sun enabled (observer overlay hidden)" : "Overlay appears after ingest"}
                      </div>
                    )}
                  </div>
                  <Input type="file" accept="image/gif,image/webp,image/apng" onChange={handleFile} />
                  <p className="text-xs text-slate-500">
                    Upload a solar EUV GIF/video. The overlay is Sun-centric; the observer view rotates it to match incoming frame geometry.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Co-rotating Sun (rotation cancelled)</Label>
                  <div className="flex items-center justify-center rounded-lg border border-slate-800 bg-slate-950 p-3">
                    {corotatingGrid ? (
                      <SolarDiskCanvas
                        mode="corotating"
                        width={corotatingSize}
                        height={corotatingSize}
                        mapSun={stretchedGridData ?? corotatingGrid.data}
                        gridSize={corotatingGrid.gridSize}
                        events={activeEventGlyphs}
                        onEventClick={handleEventSelect}
                        onEventHover={handleEventHover}
                        className="w-full h-full max-w-full"
                      />
                    ) : (
                      <div className="text-xs text-slate-500 text-center px-6 py-10">
                        Ingest an uploaded sequence to see its diagnostic overlay. Native SunPy images are displayed separately above.
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    The co-rotating view keeps north up and cancels spin. Use the shared slider and field selector to step through time and data layers.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleIngest} disabled={!videoSrc || solarCoherenceMutation.isPending}>
                  {solarCoherenceMutation.isPending ? "Ingesting..." : "Send to Solar Coherence Pipeline"}
                </Button>
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Switch id="lockSun" checked={lockSun} onCheckedChange={setLockSun} />
                  <Label htmlFor="lockSun" className="text-xs text-slate-300">
                    Lock to Sun (hide observer rotation)
                  </Label>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Label htmlFor="field-select" className="text-xs text-slate-300">
                    Color
                  </Label>
                  <select
                    id="field-select"
                    value={field}
                    onChange={(e) => setField(e.target.value as OverlayField)}
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                  >
                    <option value="intensity">Intensity</option>
                    <option value="coherence">Coherence</option>
                    <option value="phaseDispersion">Phase dispersion</option>
                    <option value="energy">Energy</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Switch id="auto-stretch" checked={autoStretch} onCheckedChange={setAutoStretch} />
                  <Label htmlFor="auto-stretch" className="text-xs text-slate-300">
                    Auto stretch (p1..p99, sqrt)
                  </Label>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Label htmlFor="frame-slider" className="text-xs text-slate-300">
                    Frame
                  </Label>
                  <input
                    id="frame-slider"
                    type="range"
                    min={0}
                    max={Math.max(totalFrames - 1, 0)}
                    value={Math.min(frameIndex, Math.max(totalFrames - 1, 0))}
                    onChange={(e) => setFrameIndex(Number(e.target.value))}
                    disabled={!totalFrames}
                    className="accent-cyan-400"
                  />
                  <span className="text-[10px] text-slate-400">
                    {totalFrames ? `${frameIndex + 1}/${totalFrames}` : "0/0"}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400">t = {timeLabel}</span>
                <span className="text-[10px] text-slate-500">
                  Display stretch only: p1..p99 rescale + sqrt; underlying data and metrics stay raw.
                </span>
              </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div hidden={activePage !== "events" && activePage !== "diagnostics"} className={activePage === "events" || activePage === "diagnostics" ? "min-w-0 space-y-4" : "hidden"}>
          <Card id="solar-diagnostics" className={`${activePage === "diagnostics" ? "" : "hidden"} bg-slate-900/60 border-slate-800`}>
            <CardHeader>
              <CardTitle>5-minute Bins (SunPy Bridge)</CardTitle>
              <CardDescription>
                Phase-tagged bins emitted from /sunpy-export with CDAWeb turbulence + GOES/SHARP flux folded in.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-3 text-[11px] text-slate-400">
                <span>Bins: {sunpyBridgeTotals?.bins ?? 0}</span>
                <span>Frames: {sunpyBridgeTotals?.frames ?? 0}</span>
                <span>Events: {sunpyBridgeTotals?.events ?? 0}</span>
                {sunpyBridgeTotals?.t0 ? <span>t0: {formatIsoShort(sunpyBridgeTotals.t0)}</span> : null}
                {sunpyTurbulenceStats ? (
                  <span className="text-amber-200">
                    Turb avg {(sunpyTurbulenceStats.avg * 100).toFixed(0)}% | peak {(sunpyTurbulenceStats.max * 100).toFixed(0)}%
                  </span>
                ) : null}
                {sunpyFlareFluxStats ? (
                  <span className="text-amber-200">
                    Flare flux {formatFlux(sunpyFlareFluxStats.total)} W/m^2 eq | peak {(sunpyFlareFluxStats.normPeak * 100).toFixed(0)}%
                  </span>
                ) : null}
                {sunpyGoesStats ? (
                  <span className="text-amber-200">
                    GOES XRS peak {formatFlux(sunpyGoesStats.peak)} W/m^2 | bins {sunpyGoesStats.count}
                  </span>
                ) : null}
                {sunpySharpSummary?.harpnum ? (
                  <span className="text-cyan-200">SHARP HARPNUM {sunpySharpSummary.harpnum}</span>
                ) : null}
              </div>
              <div className="space-y-2">
                {sunpyBridgeBins.length ? (
                  sunpyBridgeBins.slice(0, 6).map((bin, idx) => {
                    const id = `${bin.startIso}-${idx}`;
                    return (
                      <div
                        key={id}
                        className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-200"
                      >
                        <div className="flex items-center gap-3">
                          <PhaseDot phaseRad={bin.phaseRad} />
                          <div className="flex flex-col">
                            <span className="text-[11px] text-slate-300">
                              {formatIsoShort(bin.startIso)} - {formatIsoShort(bin.endIso)}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              frames {bin.frameCount} | events {bin.eventCount}
                            </span>
                          </div>
                        </div>
                        <div className="text-right text-[11px] text-slate-300">
                          <div>align {(bin.alignment * 100).toFixed(1)}%</div>
                          <div className="text-slate-500">entropy {(bin.entropy * 100).toFixed(1)}%</div>
                          {typeof bin.turbulence === "number" ? (
                            <div className="text-amber-200">turb {(bin.turbulence * 100).toFixed(0)}%</div>
                          ) : null}
                          {typeof bin.flareFluxNorm === "number" ? (
                            <div className="text-amber-300">flare {(bin.flareFluxNorm * 100).toFixed(0)}%</div>
                          ) : null}
                          {typeof bin.goesFlux === "number" && bin.goesFlux > 0 ? (
                            <div className="text-amber-300">GOES {formatFlux(bin.goesFlux)} W/m^2</div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-slate-500">
                    Load SunPy export to see 5-minute bin summaries (alignment, entropy, phase).
                  </p>
                )}
              </div>
          </CardContent>
        </Card>

        <Card className={`${activePage === "diagnostics" ? "" : "hidden"} bg-slate-900/60 border-slate-800`}>
          <CardHeader>
            <CardTitle>Raw -&gt; Grid -&gt; Coherence</CardTitle>
            <CardDescription>Bridge HEK/GOES coords and flux into the co-rotating cells the model understands.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-[11px] text-slate-200">
            <div className="flex flex-wrap gap-2 text-[10px] text-slate-300">
              <Badge variant="outline" className="border-cyan-500/40 bg-cyan-500/10 text-cyan-100">
                Grid N {bridgeGridSize ?? "n/a"}
              </Badge>
              {bridgeRsunArcsec ? (
                <Badge variant="outline" className="border-slate-700 text-slate-200">
                  R_sun {bridgeRsunArcsec.toFixed(0)}"
                </Badge>
              ) : null}
              <Badge variant="outline" className="border-slate-700 text-slate-200">
                Events {bridgeGridMeta.total}
              </Badge>
              <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-100">
                Cells {bridgeGridMeta.withCell}/{bridgeGridMeta.total || 0}
              </Badge>
            </div>

            <div className="rounded border border-slate-800 bg-slate-950/40 p-3 space-y-3">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-500">
                <span>Coords -&gt; co-rotating grid</span>
                <span className="text-slate-400">
                  {bridgeGridMeta.withUv ? `${bridgeGridMeta.withUv} with coords` : "No HEK coords yet"}
                  {bridgeGridMeta.onDisk ? ` · ${bridgeGridMeta.onDisk} on-disk` : ""}
                </span>
              </div>
              <div className="h-1.5 w-full rounded bg-slate-800">
                <div
                  className="h-full rounded bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all"
                  style={{ width: `${bridgeCellPct}%` }}
                />
              </div>
              {bridgeRows.length ? (
                <div className="overflow-auto rounded border border-slate-800 bg-slate-950/60">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-900/80 text-[10px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-2 py-2">Event</th>
                        <th className="px-2 py-2">Grid</th>
                        <th className="px-2 py-2">Flux / weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bridgeRows.map((row) => (
                        <tr key={row.id} className="border-b border-slate-800/60">
                          <td className="px-2 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="border-cyan-500/40 bg-cyan-500/10 text-cyan-100">
                                {row.type}
                              </Badge>
                              {row.goesClass ? (
                                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-100">
                                  {row.goesClass}
                                </Badge>
                              ) : null}
                              {row.noaaAr ? (
                                <Badge variant="outline" className="border-slate-700 text-slate-200">NOAA {row.noaaAr}</Badge>
                              ) : null}
                            </div>
                            <div className="text-[10px] text-slate-500">{formatIsoShort(row.startIso)}</div>
                          </td>
                          <td className="px-2 py-2 font-mono text-[10px] text-slate-200">
                            u {row.u?.toFixed?.(2)} / v {row.v?.toFixed?.(2)} {row.onDisk === false ? "(off limb)" : ""}
                            <div className="text-slate-500">
                              cell {row.cell ? `${row.cell.i},${row.cell.j} @${row.cell.n}` : "--"}
                            </div>
                          </td>
                          <td className="px-2 py-2 font-mono text-[10px] text-amber-200">
                            {row.fluxWm2 ? `${formatFlux(row.fluxWm2)} W/m^2` : "n/a"}
                            {row.mass > 0 ? <div className="text-cyan-200">log mass {row.mass.toFixed(2)}</div> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Load SunPy/HEK to project events into the co-rotating grid and tag shared (i, j) cells.
                </p>
              )}
            </div>

            <div className="rounded border border-slate-800 bg-slate-950/40 p-3 space-y-3">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Flux -&gt; coherence weights</div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-100">Flares (HEK/GOES)</div>
                  {topFlareRows.length ? (
                    topFlareRows.map((row) => (
                      <div key={row.id} className="rounded border border-slate-800 bg-slate-950/60 p-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-amber-200">{row.goesClass ?? row.type}</span>
                          <span className="text-[10px] text-slate-500">{formatIsoShort(row.startIso)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span>flux {row.fluxWm2 ? `${formatFlux(row.fluxWm2)} W/m^2` : "n/a"}</span>
                          <span className="text-cyan-200">log mass {row.mass.toFixed(2)}</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded bg-slate-800">
                          <div
                            className="h-full rounded bg-gradient-to-r from-amber-400 to-amber-300"
                            style={{ width: `${row.massPct}%` }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">
                      Add a flare window to pull GOES flux and log-scale it into eventMass for coherence bins.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-100">External drivers</div>
                  <div className="rounded border border-slate-800 bg-slate-950/60 p-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-300">Solar wind (CDAWeb)</span>
                      <span className="text-[10px] text-slate-500">{cdawebSummary.dataset}</span>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {cdawebSummary.binCount ? `bins ${cdawebSummary.binCount} | ${cdawebSummary.turbLabel}` : cdawebSummary.turbLabel}
                    </div>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-950/60 p-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-300">SHARP flux</span>
                      <span className="text-[10px] text-slate-500">
                        {sunpySharpSummary?.harpnum ? `HARPNUM ${sunpySharpSummary.harpnum}` : "none"}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {sunpySharpSummary
                        ? `mean |B| ${sunpySharpSummary.mean_abs_flux?.toFixed?.(2) ?? "n/a"} | total ${formatFlux(
                            sunpySharpSummary.total_abs_flux,
                          )}`
                        : "No SHARP patch in payload (set JSOC_EMAIL to enable)."}
                    </div>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-950/60 p-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-300">Coherence bins</span>
                      <span className="text-[10px] text-slate-500">
                        {sunpyBridgeTotals?.t0 ? formatIsoShort(sunpyBridgeTotals.t0) : ""}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {sunpyBridgeTotals
                        ? `bins ${sunpyBridgeTotals.bins} | frames ${sunpyBridgeTotals.frames} | events ${sunpyBridgeTotals.events}`
                        : "No bridge summary yet (run SunPy export)."}
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-slate-500">
                Each mapped cell shares an (i, j) index with the AIA coherence grid so flares, SHARP flux, and CDAWeb turbulence align in the bins.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card id="solar-events" className={`${activePage === "events" ? "" : "hidden"} bg-slate-900/60 border-slate-800`}>
          <CardHeader>
            <CardTitle>Flare List (GOES/HEK)</CardTitle>
            <CardDescription>Hover to highlight on the disks; click to sync the slider and lock the glyph.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-[11px] text-slate-200">
            <SolarEventEvidenceInspector
              archivedSelection={Boolean(sunpyData?.selected_event_context && !sunpyData.events?.length)}
              event={findSunpyEventById(selectedEventId) ?? (sunpyData?.selected_event_context?.eventId===selectedEventId
                ? {id:sunpyData.selected_event_context.eventId,event_type:sunpyData.selected_event_context.eventType,
                  start_time:sunpyData.selected_event_context.eventStartUtc,
                  end_time:sunpyData.selected_event_context.eventEndUtc ?? undefined,
                  frm_name:sunpyData.selected_event_context.detectionMethod ?? undefined}:null)}
              frame={sunpyData?.selected_event_context && !sunpyData.events?.length
                ? sunpyData.frames[sunpyData.selected_event_context.selectedFrameIndex] ?? null:currentSunpyFrame}
              observation={sunpyData} />
            {sunpyFlareRows.length ? (
              <div className="max-h-[260px] overflow-auto rounded border border-slate-800 bg-slate-950/40">
                <table className="w-full text-left text-[11px] text-slate-200">
                  <thead className="bg-slate-900/80 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Class</th>
                      <th className="px-2 py-2">Start</th>
                      <th className="px-2 py-2">End</th>
                      <th className="px-2 py-2">AR</th>
                      <th className="px-2 py-2">u / v</th>
                      <th className="px-2 py-2">fl_peakflux</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sunpyFlareRows.slice(0, 48).map((row, idx) => {
                      const isSelected = selectedEventId === row.id;
                      const isHovered = hoverEventId === row.id;
                      const rowClass = isSelected
                        ? "bg-cyan-500/10 border-cyan-500/50"
                        : isHovered
                          ? "bg-slate-800/60 border-slate-700"
                          : "border-transparent";
                      return (
                        <tr
                          key={row.id}
                          className={`border-b border-slate-800/60 ${rowClass} transition`}
                          onMouseEnter={() => handleEventHover(row.id)}
                          onMouseLeave={() => handleEventHover(null)}
                          onClick={() => handleEventSelect(row.id)}
                        >
                          <td className="px-2 py-1 font-semibold text-amber-200">{row.goesClass}</td>
                          <td className="px-2 py-1 text-slate-300">{formatIsoShort(row.start)}</td>
                          <td className="px-2 py-1 text-slate-400">{formatIsoShort(row.end)}</td>
                          <td className="px-2 py-1 text-slate-200">{row.noaaAr ?? "--"}</td>
                          <td className="px-2 py-1 font-mono text-[10px] text-slate-300">
                            {Number.isFinite(row.u) ? row.u?.toFixed?.(2) : "--"} / {Number.isFinite(row.v) ? row.v?.toFixed?.(2) : "--"}
                          </td>
                          <td className="px-2 py-1 font-mono text-[10px] text-cyan-200">
                            {typeof row.peakFlux === "number" ? formatFlux(row.peakFlux) : "n/a"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Load SunPy/HEK to populate recent flares.</p>
            )}
            <p className="text-[10px] text-slate-500">
              Hover draws a glyph on the co-rot disk; click jumps the slider to the nearest frame and locks the overlay.
            </p>
          </CardContent>
        </Card>

        <Card className={`${activePage === "diagnostics" ? "" : "hidden"} bg-slate-900/60 border-slate-800`}>
          <CardHeader>
            <CardTitle>GOES XRS vs Pp</CardTitle>
            <CardDescription>Log GOES flux with flare bands; overlay p-mode energy per 300 s bin.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-[11px] text-slate-200">
            {goesSparkline ? (
              <div className="rounded border border-slate-800 bg-slate-950/40 p-2">
                <svg width={goesSparkline.width} height={goesSparkline.height} className="w-full">
                  <rect x={0} y={0} width={goesSparkline.width} height={goesSparkline.height} fill="url(#goes-bg)" rx={4} />
                  {goesSparkline.binLines.map((line) => (
                    <line
                      key={line.id}
                      x1={line.x}
                      x2={line.x}
                      y1={0}
                      y2={goesSparkline.height}
                      stroke="rgba(255,255,255,0.05)"
                      strokeWidth={1}
                    />
                  ))}
                  <polyline
                    fill="none"
                    stroke="rgba(249,115,22,0.9)"
                    strokeWidth={1.5}
                    points={goesSparkline.flarePoints}
                  />
                  <polyline fill="none" stroke="rgba(34,211,238,0.9)" strokeWidth={1.5} points={goesSparkline.pModePoints} />
                  <defs>
                    <linearGradient id="goes-bg" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="rgba(12,16,32,0.9)" />
                      <stop offset="100%" stopColor="rgba(10,10,20,0.8)" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-slate-400">
                  <span className="text-amber-300">GOES XRS (log)</span>
                  <span className="text-cyan-300">Pp (p-mode energy)</span>
                  <span className="text-slate-500">Vertical lines = bin centers</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Load SunPy bridge bins to view GOES + p-mode overlay.</p>
            )}
          </CardContent>
        </Card>

        <Card className={`${activePage === "diagnostics" ? "" : "hidden"} bg-slate-900/60 border-slate-800`}>
          <CardHeader>
            <CardTitle>Solar-wind B (CDAWeb)</CardTitle>
            <CardDescription>Magnetic magnitude per bin; shading tracks turbulence.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-[11px] text-slate-200">
            {cdawebSeries ? (
              <div className="rounded border border-slate-800 bg-slate-950/40 p-2">
                <svg width={cdawebSeries.width} height={cdawebSeries.height} className="w-full">
                  <rect x={0} y={0} width={cdawebSeries.width} height={cdawebSeries.height} fill="rgba(15,18,35,0.8)" rx={4} />
                  {cdawebSeries.bars.map((bar) => (
                    <rect
                      key={bar.id}
                      x={bar.x}
                      y={cdawebSeries.height - bar.h}
                      width={bar.w}
                      height={bar.h}
                      fill="rgba(94,234,212,0.3)"
                      stroke={`rgba(248,180,0,${0.2 + bar.turb * 0.6})`}
                      strokeWidth={1}
                      opacity={0.6 + bar.turb * 0.4}
                    />
                  ))}
                </svg>
                <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-slate-400">
                  <span className="text-emerald-300">|B| magnitude</span>
                  <span className="text-amber-300">Stroke depth = turbulence</span>
                  <span className="text-slate-500">Shaded 300 s bins</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No CDAWeb bins yet; enable cdaweb export to populate this panel.</p>
            )}
          </CardContent>
        </Card>

        <Card className={`${activePage === "diagnostics" ? "" : "hidden"} bg-slate-900/60 border-slate-800`}>
          <CardHeader>
            <CardTitle>External Drivers</CardTitle>
            <CardDescription>CDAWeb turbulence, GOES flare flux, and SHARP flux baked into the bin metadata.</CardDescription>
          </CardHeader>
            <CardContent className="space-y-3 text-[11px] text-slate-200">
              <div className="rounded border border-slate-800 bg-slate-950/40 p-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Solar wind (CDAWeb)</div>
                <div className="text-xs text-slate-200">
                  {sunpyCdawebBlock?.dataset ? `Dataset ${sunpyCdawebBlock.dataset}` : "No CDAWeb block in payload."} | bins{" "}
                  {sunpyCdawebBlock?.bins?.length ?? 0}
                  {sunpyTurbulenceStats ? ` | avg turb ${(sunpyTurbulenceStats.avg * 100).toFixed(0)}%` : null}
                  {sunpyCdawebBlock?.reason && sunpyCdawebBlock.reason !== "ok" ? ` | ${sunpyCdawebBlock.reason}` : null}
                </div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-950/40 p-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">GOES XRS</div>
                <div className="text-xs text-slate-200">
                  {sunpyGoesStats
                    ? `bins ${sunpyGoesStats.count} | peak ${formatFlux(sunpyGoesStats.peak)} W/m^2 | mean ${formatFlux(
                        sunpyGoesStats.mean,
                      )} W/m^2`
                    : sunpyData?.goes_xrs?.reason
                      ? `No GOES XRS (reason: ${sunpyData.goes_xrs.reason})`
                      : "No GOES XRS block in payload."}
                </div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-950/40 p-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Flare flux (GOES/HEK)</div>
                <div className="text-xs text-slate-200">
                  {sunpyFlareFluxStats
                    ? `Total ${formatFlux(sunpyFlareFluxStats.total)} W/m^2 eq | peak ${(sunpyFlareFluxStats.normPeak * 100).toFixed(0)}%`
                    : "No flare flux accumulated yet; load a flare window to populate this signal."}
                </div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-950/40 p-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">SHARP flux</div>
                <div className="text-xs text-slate-200">
                  {sunpySharpSummary
                    ? `HARPNUM ${sunpySharpSummary.harpnum ?? "--"} | mean |Bp| ${
                        sunpySharpSummary.mean_abs_flux !== undefined ? sunpySharpSummary.mean_abs_flux.toFixed(2) : "n/a"
                      } | total ${formatFlux(sunpySharpSummary.total_abs_flux)}`
                    : "No SHARP patch fetched (set JSOC_EMAIL and enable jsoc_sharp)."}
                  {sunpyData?.jsoc_cutout
                    ? ` | Cutout: ${sunpyData.jsoc_cutout.width_arcsec ?? "?"}x${sunpyData.jsoc_cutout.height_arcsec ?? "?"} arcsec`
                    : null}
                </div>
              </div>
              <p className="text-[10px] text-slate-500">
                These signals modulate alignment/dispersion for each 300 s bin: turbulence down-weights coherence, flare flux raises energy, and SHARP flux
                nudges alignment.
              </p>
            </CardContent>
          </Card>

          {sunpyData && !sunpyIntensityGrid ? (
            <Card className={`${activePage === "diagnostics" ? "" : "hidden"} bg-amber-950/30 border-amber-700/60`}>
              <CardHeader>
                <CardTitle>SunPy Debug</CardTitle>
                <CardDescription>{sunpyDebugDescription}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-[11px] text-amber-100">
                <div>frames: {sunpyData.debug?.frames ?? sunpyData.frames?.length ?? 0}</div>
                <div>frames with map_b64: {sunpyData.debug?.map_b64_frames ?? 0}</div>
                <div>grid sizes: {(sunpyData.debug?.grid_sizes ?? []).join(", ") || "n/a"}</div>
                <div>events: {sunpyData.events?.length ?? 0}</div>
                {sunpyReason ? <div>reason: {sunpyReason}</div> : null}
                {sunpyFramesMissing ? (
                  <div>frames_missing: yes{sunpyFramesMissingReasonLabel ? ` (${sunpyFramesMissingReasonLabel})` : ""}</div>
                ) : null}
                {sunpyData.debug?.fallback ? <div>fallback: {sunpyData.debug.fallback}</div> : null}
                {sunpyData.debug?.timeout_ms ? <div>timeout_ms: {sunpyData.debug.timeout_ms}</div> : null}
                {sunpyData.debug?.error ? <div className="text-amber-200">error: {String(sunpyData.debug.error)}</div> : null}
                {sunpyData.debug?.error_hint ? (
                  <div className="text-amber-200">hint: {sunpyData.debug.error_hint}</div>
                ) : null}
                {sunpyData.debug?.fallback || sunpyFramesMissing ? (
                  <div className="rounded border border-amber-400/50 bg-amber-500/10 p-2 text-amber-50">
                    {sunpyDebugTip}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card className={`${activePage === "events" ? "" : "hidden"} bg-slate-900/60 border-slate-800`}>
            <CardHeader>
              <CardTitle>HEK Events</CardTitle>
              <CardDescription>Click to sync the slider and highlight the glyph on the disks.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
                <span>Frames: {sunpyData?.frames?.length ?? 0}</span>
                <span>Events: {sunpyData?.events?.length ?? 0}</span>
              </div>
              <div className="max-h-[520px] space-y-2 overflow-auto">
                {sunpyEventsSorted.length ? (
                  sunpyEventsSorted.map((ev, idx) => {
                    const id = ev.id ?? ev.ivorn ?? `${ev.event_type}-${idx}`;
                    const selected = selectedEventId === id;
                    const hovered = hoverEventId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => handleEventSelect(id)}
                        onMouseEnter={() => handleEventHover(id)}
                        onMouseLeave={() => handleEventHover(null)}
                        className={`w-full rounded border px-3 py-2 text-left transition ${
                          selected
                            ? "border-cyan-500/60 bg-cyan-500/10"
                            : hovered
                              ? "border-slate-700 bg-slate-800/60"
                              : "border-slate-800 bg-slate-950/40"
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-100">{ev.event_type ?? "EV"}</span>
                          <span className="text-[10px] text-slate-400">{formatIsoShort(ev.start_time ?? ev.start)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                          {ev.goes_class ? (
                            <Badge variant="outline" className="border-amber-500/50 bg-amber-500/10 text-amber-100">
                              {ev.goes_class}
                            </Badge>
                          ) : null}
                          {typeof ev.peak_flux === "number" ? (
                            <Badge variant="outline" className="border-cyan-500/50 bg-cyan-500/10 text-cyan-100">
                              {formatFlux(ev.peak_flux)} W/m^2
                            </Badge>
                          ) : null}
                          {ev.noaa_ar ? (
                            <Badge variant="outline" className="border-slate-700 text-slate-200">
                              NOAA {ev.noaa_ar}
                            </Badge>
                          ) : null}
                          <span>
                            u={ev.u?.toFixed?.(2) ?? "--"}, v={ev.v?.toFixed?.(2) ?? "--"} {ev.on_disk === false ? " (off limb)" : ""}
                          </span>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <p className="text-sm text-slate-500">Load SunPy to view HEK events and sync the slider.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className={`${activePage === "diagnostics" ? "" : "hidden"} bg-slate-900/60 border-slate-800`}>
            <CardHeader>
              <CardTitle>Observable Motion & Coherence</CardTitle>
              <CardDescription>Derived session metrics from the co-rotating grid; not direct solar measurements.</CardDescription>
              <SolarEvidenceStatus kind="Derived diagnostic" availability={metrics?'Available':'Missing'}
                provenance="Star-service session snapshot; a successful response does not establish measured provenance."
                quantity="Normalized coherence, dispersion and band-power proxies."
                processing="Session initialization, heuristic baselines and derived event/driver summaries; readiness is separate from scientific validation."
                uncertainty="No calibrated observational uncertainty model supplied for these gauges."
                limitations="Service defaults can exist before observations. These metrics do not measure core transport, establish helioseismic mode power, or certify a stellar evolution model." />
            </CardHeader>
            <CardContent className="space-y-3">
              <Metric
                label="Regime"
                detail="locked / mixed / turbulent"
                valueLabel={
                  metrics?.regime === "locked"
                    ? "locked"
                    : metrics?.regime === "turbulent"
                      ? "turbulent"
                      : metrics?.regime === "warming_up"
                        ? "warming up"
                        : metrics?.regime === "mixed"
                          ? "mixed"
                          : "--"
                }
              />
              <Metric label="Coherence" detail="C = global_coherence" value={metrics?.coherence ?? undefined} />
              <Metric
                label="Phase dispersion"
                detail="sigma_phi = std(driver) vs quiet baselines"
                value={metrics?.phaseDispersion ?? undefined}
                valueLabel={metrics && !metrics.phaseReady ? "warming up" : undefined}
              />
              <Metric
                label="Band power (p-mode)"
                detail="Pp = |driver| normalized to rolling p90"
                value={metrics?.bandPower ?? undefined}
                valueLabel={metrics && !metrics.bandReady ? "warming up" : undefined}
              />
              {metrics?.historyAvailable ? (
                <p className="text-[11px] text-slate-500">
                  History {metrics.historyBins}/{metrics.historyRequired || Math.max(metrics.historyBins, 1)} bins used
                  for dispersion/p-mode scaling.
                </p>
              ) : null}
              <p className="text-[11px] text-slate-500">
                With only a couple of frames or zero flares, the guards stay in "warming up" until a few 300 s bins accumulate.
              </p>
              <Separator className="bg-slate-800" />
              <p className="text-xs text-slate-400">
                The pipeline works in the co-rotating Sun-centric grid, then reprojects for the observer overlay. Toggle
                "Lock to Sun" to stare straight at the evolving features without apparent spin.
              </p>
            </CardContent>
          </Card>
          <div className={activePage === "diagnostics" ? "" : "hidden"}><SolarKhiNativeOverlay /></div>
        </div>
      </div>
    </div>
  );
}

function PhaseDot({ phaseRad }: { phaseRad: number }) {
  const r = 12;
  const cx = 16;
  const cy = 16;
  const angle = phaseRad - Math.PI / 2; // rotate so phase=0 points up
  const x = cx + r * Math.cos(angle);
  const y = cy + r * Math.sin(angle);
  return (
    <svg width={32} height={32} className="shrink-0">
      <circle cx={cx} cy={cy} r={r} className="fill-slate-950 stroke-slate-700" strokeWidth={1} />
      <circle cx={x} cy={y} r={3} className="fill-amber-300" />
    </svg>
  );
}

function Metric({
  label,
  value,
  detail,
  valueLabel,
}: {
  label: string;
  value?: number;
  detail?: string;
  valueLabel?: string;
}) {
  const display =
    valueLabel ?? (typeof value === "number" ? `${(value * 100).toFixed(1)}%` : typeof value === "string" ? value : "--");
  const color =
    valueLabel !== undefined
      ? "text-cyan-200"
      : typeof value === "number"
        ? value >= 0.7
          ? "text-emerald-300"
          : value >= 0.5
            ? "text-amber-300"
            : "text-rose-300"
        : "text-slate-400";
  return (
    <div className="flex items-center justify-between rounded border border-slate-800 bg-slate-950 px-3 py-2">
      <div className="flex flex-col">
        <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
        {detail ? <span className="text-[10px] font-mono text-slate-500">{detail}</span> : null}
      </div>
      <span className={`font-mono ${color}`}>{display}</span>
    </div>
  );
}

function goesFluxWm2FromClass(goes?: string): number {
  if (!goes) return 0;
  const match = goes.trim().toUpperCase().match(/^([A-Z])\s*([0-9.]+)?/);
  if (!match) return 0;
  const letter = match[1];
  const value = Number.parseFloat(match[2] ?? "1");
  const letterScale: Record<string, number> = { A: 1e-8, B: 1e-7, C: 1e-6, M: 1e-5, X: 1e-4 };
  return Math.max(0, value * (letterScale[letter] ?? 0));
}

function eventPeakFluxWm2(ev?: SunpyExportEvent): number {
  if (!ev) return 0;
  if (Number.isFinite(ev.peak_flux)) {
    return Math.max(0, ev.peak_flux as number);
  }
  return goesFluxWm2FromClass(ev.goes_class);
}

function estimateFlareMass(ev: SunpyExportEvent): number {
  const type = (ev.event_type ?? "").toUpperCase();
  if (type !== "FL") return 0;
  const flux = eventPeakFluxWm2(ev);
  if (!(flux > 0)) return 0;
  return Math.max(0, Math.log10(flux / 1e-7));
}

function resolveGridCell(ev: SunpyExportEvent, gridSize?: number | null) {
  const nDirect = Number.isFinite(ev.grid_n as number) ? (ev.grid_n as number) : gridSize;
  const iDirect = Number.isFinite(ev.grid_i as number) ? (ev.grid_i as number) : null;
  const jDirect = Number.isFinite(ev.grid_j as number) ? (ev.grid_j as number) : null;
  if (nDirect && iDirect !== null && jDirect !== null) {
    return { i: iDirect, j: jDirect, n: nDirect };
  }
  const n = Number.isFinite(nDirect) ? (nDirect as number) : undefined;
  if (!n || n < 2) return null;
  if (!Number.isFinite(ev.u as number) || !Number.isFinite(ev.v as number)) return null;
  const i = Math.max(0, Math.min(n - 1, Math.round(((ev.u as number) * 0.5 + 0.5) * (n - 1))));
  const j = Math.max(0, Math.min(n - 1, Math.round(((-(ev.v as number)) * 0.5 + 0.5) * (n - 1))));
  return { i, j, n };
}

function decodeFloat32(b64?: string): Float32Array {
  if (!b64) return new Float32Array();
  const binary = atob(b64);
  const len = binary.length;
  const chunkSize = 0x8000;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += chunkSize) {
    const end = Math.min(i + chunkSize, len);
    for (let j = i; j < end; j++) {
      bytes[j] = binary.charCodeAt(j);
    }
  }
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

function normalizeEnergy(energy: number, gridSize: number): number {
  if (!Number.isFinite(energy) || gridSize <= 0) return 0;
  const norm = energy / (gridSize * gridSize);
  return Math.min(1, Math.max(0, norm));
}

function computeStats(arr: Float32Array, gridSize: number) {
  const finite: number[] = [];
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  let sumSq = 0;
  let insideCount = 0;
  const N = gridSize;
  for (let idx = 0; idx < arr.length; idx++) {
    const v = arr[idx];
    if (!Number.isFinite(v)) continue;
    const y = Math.floor(idx / N);
    const x = idx - y * N;
    const u = (x / (N - 1)) * 2 - 1;
    const vNorm = (y / (N - 1)) * 2 - 1;
    if (u * u + vNorm * vNorm > 1) continue; // skip off-disk
    insideCount++;
    finite.push(v);
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    sumSq += v * v;
  }
  if (!finite.length || insideCount === 0) {
    return { min: 0, max: 0, mean: 0, std: 0, power: 0, p01: 0, p80: 0, p95: 0, p99: 0 };
  }
  finite.sort((a, b) => a - b);
  const mean = sum / finite.length;
  const variance = Math.max(0, sumSq / finite.length - mean * mean);
  const std = Math.sqrt(variance);
  const pct = (p: number) => finite[Math.min(finite.length - 1, Math.max(0, Math.floor(p * finite.length)))] ?? 0;
  return {
    min,
    max,
    mean,
    std,
    power: sum,
    p01: pct(0.01),
    p80: pct(0.8),
    p95: pct(0.95),
    p99: pct(0.99),
  };
}

function applyDisplayStretch(
  data: Float32Array,
  gridSize: number,
  stats?: ReturnType<typeof computeStats>,
  enabled = true,
): Float32Array {
  if (!enabled || !stats) return data;
  const lo = Number.isFinite(stats.p01) ? stats.p01 : stats.min;
  const hi = Number.isFinite(stats.p99) ? stats.p99 : stats.max;
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return data;
  const stretched = new Float32Array(data.length);
  const N = gridSize;
  for (let idx = 0; idx < data.length; idx++) {
    const y = Math.floor(idx / N);
    const x = idx - y * N;
    const u = (x / (N - 1)) * 2 - 1;
    const vNorm = (y / (N - 1)) * 2 - 1;
    if (u * u + vNorm * vNorm > 1) {
      stretched[idx] = 0;
      continue;
    }
    const v = data[idx];
    const norm = (v - lo) / (hi - lo);
    const clamped = Math.max(0, Math.min(1, norm));
    stretched[idx] = Math.sqrt(clamped);
  }
  return stretched;
}

function findHotspots(grid: Float32Array, N: number, threshold: number): Hotspot[] {
  const visited = new Uint8Array(N * N);
  const hotspots: Hotspot[] = [];
  let diskCells = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = (x / (N - 1)) * 2 - 1;
      const v = (y / (N - 1)) * 2 - 1;
      if (u * u + v * v <= 1) diskCells++;
    }
  }
  const totalCells = Math.max(1, diskCells);
  const toIdx = (x: number, y: number) => y * N + x;

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const idx = toIdx(x, y);
      const u = (x / (N - 1)) * 2 - 1;
      const v = (y / (N - 1)) * 2 - 1;
      if (u * u + v * v > 1) {
        visited[idx] = 1;
        continue;
      }
      if (visited[idx]) continue;
      const val = grid[idx];
      if (!(val > threshold)) continue;
      // flood fill
      let peak = val;
      let sumX = 0;
      let sumY = 0;
      let count = 0;
      const stack = [[x, y]];
      visited[idx] = 1;
      while (stack.length) {
        const [sx, sy] = stack.pop() as [number, number];
        const sIdx = toIdx(sx, sy);
        const sv = grid[sIdx];
        if (sv > peak) peak = sv;
        sumX += sx;
        sumY += sy;
        count++;
        const neighbors = [
          [sx + 1, sy],
          [sx - 1, sy],
          [sx, sy + 1],
          [sx, sy - 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue;
          const nIdx = toIdx(nx, ny);
          if (visited[nIdx]) continue;
          if (grid[nIdx] > threshold) {
            visited[nIdx] = 1;
            stack.push([nx, ny]);
          }
        }
      }
      const areaFrac = count / totalCells;
      const uCenter = ((sumX / count) / (N - 1)) * 2 - 1;
      const vCenterImage = ((sumY / count) / (N - 1)) * 2 - 1;
      const vCenterNorthUp = -vCenterImage; // flip so +v is north-up
      const radius = Math.sqrt(areaFrac / Math.PI);
      hotspots.push({ peak, areaFrac, u: uCenter, v: vCenterNorthUp, radius });
    }
  }

  hotspots.sort((a, b) => b.peak - a.peak);
  return hotspots;
}

function mapUvToCanvasPixel(
  u: number,
  vNorthUp: number,
  diskGeom: DiskGeom,
  canvasWidth: number,
  canvasHeight: number,
) {
  const scaleX = diskGeom.frameWidth && diskGeom.frameWidth > 0 ? canvasWidth / diskGeom.frameWidth : 1;
  const scaleY = diskGeom.frameHeight && diskGeom.frameHeight > 0 ? canvasHeight / diskGeom.frameHeight : 1;
  const scale = Math.min(scaleX, scaleY);
  const cx = diskGeom.cx * scaleX;
  const cy = diskGeom.cy * scaleY;
  const r = diskGeom.r * scale;
  const x = cx + u * r;
  const y = cy - vNorthUp * r; // flip because screen y grows downward
  return { x, y, r };
}

function HotspotOverlay({
  canvasWidth,
  canvasHeight,
  diskGeom,
  hotspots,
}: {
  canvasWidth: number;
  canvasHeight: number;
  diskGeom: DiskGeom;
  hotspots: Hotspot[];
}) {
  if (!diskGeom || !hotspots.length) return null;
  return (
    <svg
      width={canvasWidth}
      height={canvasHeight}
      viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
      className="absolute inset-0 pointer-events-none"
      style={{ width: "100%", height: "100%" }}
    >
      {hotspots.map((h, idx) => {
        const { x, y, r } = mapUvToCanvasPixel(h.u, h.v, diskGeom, canvasWidth, canvasHeight);
        const drawRadius = Math.max(4, r * h.radius * 0.6);
        return (
          <circle
            key={idx}
            cx={x}
            cy={y}
            r={drawRadius}
            fill="none"
            stroke="cyan"
            strokeWidth={1.5}
            opacity={0.85}
          />
        );
      })}
    </svg>
  );
}
