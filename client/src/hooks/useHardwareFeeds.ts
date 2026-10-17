import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

export type HardwareSource = "bridge" | "files" | "direct";

export type HardwareStatusLevel = "idle" | "pending" | "ok" | "error";

export type HardwareConnectHelp = {
  instruments: string[];
  feeds: string[];
  notes: string[];
  fileTypes?: string[];
  profiles?: Array<{
    name: string;
    description?: string;
    json: string;
  }>;
};

export type HardwareStatus = {
  level: HardwareStatusLevel;
  source?: HardwareSource;
  message?: string;
  timestamp?: number;
};

export type HardwareEvent = {
  type: string;
  payload: unknown;
  receivedAt: number;
};

export type HardwareFileKind = "vacuum-sweep" | "spectrum" | "sector-state";

export type HardwareFileIngestConfig = {
  endpoint: string;
  kind: HardwareFileKind;
};

export type UseHardwareFeedsOptions = {
  panelId: string;
  panelTitle: string;
  help: HardwareConnectHelp;
  fileIngest?: HardwareFileIngestConfig;
  onLiveChange?: (live: boolean) => void;
};

export type HardwareFeedsController = {
  panelId: string;
  panelTitle: string;
  help: HardwareConnectHelp;
  open: boolean;
  setOpen: (value: boolean) => void;
  status: HardwareStatus;
  profileJson: string;
  setProfileJson: (value: string) => void;
  connectViaBridge: (opts?: { profileOverride?: unknown }) => Promise<void>;
  connectFromProfile?: (value: string) => Promise<void>;
  ingestFiles: (files: FileList | File[]) => Promise<void>;
  connectDirect: () => Promise<void>;
  disconnect: () => void;
  isLive: boolean;
  activeSource: HardwareSource | null;
  lastEvent?: HardwareEvent;
};

const STREAM_PATH = "/api/helix/hardware/stream";

const getInitialProfile = (panelId: string) => {
  if (typeof window === "undefined") return "";
  const raw = window.localStorage.getItem(`helix.profile.${panelId}`);
  return raw ?? "";
};

const persistProfile = (panelId: string, value: string) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`helix.profile.${panelId}`, value);
  } catch {
    // non-fatal
  }
};

type ParseProfileSuccess = { ok: true; obj: unknown; pretty: string };
type ParseProfileFailure = { ok: false; message: string };

const parseProfileString = (str: string): ParseProfileSuccess | ParseProfileFailure => {
  const trimmed = str.trim();
  if (!trimmed) {
    return { ok: true, obj: {}, pretty: "" };
  }
  try {
    const obj = JSON.parse(trimmed);
    const pretty = JSON.stringify(obj, null, 2);
    return { ok: true, obj, pretty };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Profile JSON parse failed: ${message}` };
  }
};

type CsvRow = Record<string, string>;

const parseCsv = (text: string): CsvRow[] => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = lines[i].split(",").map((cell) => cell.trim());
    const row: CsvRow = {};
    headers.forEach((header, idx) => {
      row[header] = cells[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
};

const coerceNumber = (value: unknown): number | undefined => {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : undefined;
  }
  return undefined;
};

function normalizeSweepRowUnitsAndKeys(input: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...input };

  // ---- preferred canonical keys (flat VacuumGapSweepRow) ----
  // Frequency / phase
  if (out.pumpFreq_Hz != null && out.Omega_GHz == null) {
    const fHz = Number(out.pumpFreq_Hz);
    if (Number.isFinite(fHz)) out.Omega_GHz = fHz / 1e9;
  }
  if (out.phase_deg != null && out.phi_deg == null) {
    out.phi_deg = out.phase_deg;
  }
  if (out.pumpPhase_deg != null && out.phi_deg == null) {
    out.phi_deg = out.pumpPhase_deg;
  }

  // κ and detune: allow Hz inputs; store MHz alongside Hz for UI convenience
  const toMHz = (v: unknown) => {
    const x = Number(v);
    return Number.isFinite(x) ? x / 1e6 : undefined;
  };
  if (out.kappa_Hz != null && out.kappa_MHz == null) out.kappa_MHz = toMHz(out.kappa_Hz);
  if (out.kappaEff_Hz != null && out.kappaEff_MHz == null) out.kappaEff_MHz = toMHz(out.kappaEff_Hz);
  if (out.detune_Hz != null && out.detune_MHz == null) out.detune_MHz = toMHz(out.detune_Hz);

  // Noise naming: honor server/client expectations
  if (out.noiseTemperature_K != null && out.noiseTemp_K == null) out.noiseTemp_K = out.noiseTemperature_K;
  if (out.noise_temp_K != null && out.noiseTemp_K == null) out.noiseTemp_K = out.noise_temp_K;

  // Modulation depth: allow % or fraction
  if (out.modulationDepth_pct != null && out.m == null) {
    const pct = Number(out.modulationDepth_pct);
    if (Number.isFinite(pct)) out.m = pct / 100;
  }

  // Guard: gain naming
  if (out.gain_dB != null && out.G == null) out.G = out.gain_dB;

  return out;
}

const normalizeSweepRow = (row: Record<string, unknown>) => {
  const aliases: Record<string, string> = {
    gap_nm: "d_nm",
    depth: "m",
    m_pct: "modulationDepth_pct",
    pumpFreq_GHz: "Omega_GHz",
    pump_GHz: "Omega_GHz",
    detuneMHz: "detune_MHz",
    rho: "pumpRatio",
    rho_g_over_gth: "pumpRatio",
    G_dB: "G",
    qCavity: "QL",
    q_loaded: "QL",
    Q_loaded: "QL",
  };

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const target = aliases[key] ?? key;
    out[target] = value;
  }

  if (typeof out.m === "string") {
    const pct = coerceNumber(out.m);
    if (pct !== undefined) out.m = pct > 1 ? pct / 100 : pct;
  }
  if (out.modulationDepth_pct != null && out.m == null) {
    const pct = coerceNumber(out.modulationDepth_pct);
    if (pct !== undefined) out.m = pct > 1 ? pct / 100 : pct;
  }
  return normalizeSweepRowUnitsAndKeys(out);
};

const normalizeSpectrumSnapshot = (row: Record<string, unknown>) => {
  const aliases: Record<string, string> = {
    f_Hz: "f_Hz",
    freq_Hz: "f_Hz",
    P_dBm: "P_dBm",
    power_dBm: "P_dBm",
    RBW: "RBW_Hz",
    rbw_Hz: "RBW_Hz",
  };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const target = aliases[key] ?? key;
    out[target] = value;
  }
  return out;
};

const normalizeSectorState = (row: Record<string, unknown>) => {
  const aliases: Record<string, string> = {
    dwell: "dwell_ms",
    dwellMs: "dwell_ms",
    dwell_ms: "dwell_ms",
    dwell_us: "dwell_us",
    dwell_ns: "dwell_ns",
    burst: "burst_ms",
    burstMs: "burst_ms",
    burst_ms: "burst_ms",
    burst_us: "burst_us",
    burst_ns: "burst_ns",
    cycle_us: "cycle_us",
    cycle_ms: "cycle_ms",
    strobe: "strobeHz",
    strobe_hz: "strobeHz",
    sector: "currentSector",
    sectorIdx: "currentSector",
    sectors: "activeSectors",
    sectorsConcurrent: "sectorsConcurrent",
    sectorCount: "sectorCount",
    sectorsTotal: "sectorCount",
    sectors_total: "sectorCount",
    totalSectors: "sectorCount",
    total_sectors: "sectorCount",
    dutyCycle: "measuredDutyCycle",
    duty_cycle: "measuredDutyCycle",
    duty: "measuredDutyCycle",
    dutyEffectiveFR: "measuredSectorDuty",
    dutyEffective_FR: "measuredSectorDuty",
    duty_ship: "measuredSectorDuty",
    modulationFreq_Hz: "modulationFreq_Hz",
    modulationFreqHz: "modulationFreq_Hz",
    modulation_freq_hz: "modulationFreq_Hz",
    modulationFreq_GHz: "modulationFreq_GHz",
    modulationFreqGHz: "modulationFreq_GHz",
    modulation_freq_ghz: "modulationFreq_GHz",
    mod_freq_hz: "modulationFreq_Hz",
    mod_freq_ghz: "modulationFreq_GHz",
    pulseFrequency_Hz: "pulseFrequency_Hz",
    pulseFrequencyHz: "pulseFrequency_Hz",
    pulse_freq_hz: "pulseFrequency_Hz",
    pulseFrequency_GHz: "pulseFrequency_GHz",
    pulseFrequencyGHz: "pulseFrequency_GHz",
    pulse_freq_ghz: "pulseFrequency_GHz",
    cavityQ: "cavityQ",
    q_cavity: "cavityQ",
    qCavity: "cavityQ",
    q_loaded: "QL",
    Q_loaded: "QL",
    qLoaded: "QL",
    gammaGeo: "gammaGeo",
    gamma_geo: "gammaGeo",
    gammaVdB: "gammaVanDenBroeck",
    gamma_vdb: "gammaVanDenBroeck",
    gamma_vdB: "gammaVanDenBroeck",
    gammaVanDenBroeck: "gammaVanDenBroeck",
    qSpoilingFactor: "qSpoilingFactor",
    q_spoiling: "qSpoilingFactor",
    q_spoil: "qSpoilingFactor",
    qSpoil: "qSpoilingFactor",
    qMechanical: "qMechanical",
    q_mechanical: "qMechanical",
    qMech: "qMechanical",
  };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const target = aliases[key] ?? key;
    out[target] = value;
  }
  return out;
};

const mapRowByKind = (kind: HardwareFileKind, row: Record<string, unknown>) => {
  if (kind === "vacuum-sweep") return normalizeSweepRow(row);
  if (kind === "spectrum") return normalizeSpectrumSnapshot(row);
  if (kind === "sector-state") return normalizeSectorState(row);
  return row;
};

const isTouchstone = (filename: string) => {
  const lower = filename.toLowerCase();
  return lower.endsWith(".snp") || lower.endsWith(".s2p") || lower.endsWith(".s1p");
};

const parseTouchstone = (text: string) => {
  // Minimal Touchstone parser: read freq/power magnitude (dB) from lines without '#'.
  const rows: { f_Hz: number; P_dBm: number }[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("!") || trimmed.startsWith("#")) continue;
    const parts = trimmed.split(/\s+/).map((part) => part.trim());
    if (parts.length < 3) continue;
    const freq = Number(parts[0]);
    const magnitude = Number(parts[1]);
    if (!Number.isFinite(freq) || !Number.isFinite(magnitude)) continue;
    rows.push({ f_Hz: freq, P_dBm: magnitude });
  }
  return rows;
};

const ensureArray = <T,>(input: T | T[]): T[] => (Array.isArray(input) ? input : [input]);

export function useHardwareFeeds(options: UseHardwareFeedsOptions): HardwareFeedsController {
  const { panelId, panelTitle, help, fileIngest, onLiveChange } = options;
  const [open, setOpen] = useState(false);
  const [profileJson, setProfileJsonInternal] = useState(() => getInitialProfile(panelId));
  const [status, setStatus] = useState<HardwareStatus>({ level: "idle" });
  const [isLive, setIsLive] = useState(false);
  const [activeSource, setActiveSource] = useState<HardwareSource | null>(null);
  const [lastEvent, setLastEvent] = useState<HardwareEvent | undefined>(undefined);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    onLiveChange?.(isLive);
  }, [isLive, onLiveChange]);

  useEffect(() => {
    // Reset profile when panel changes
    setProfileJsonInternal(getInitialProfile(panelId));
    setStatus({ level: "idle" });
    setIsLive(false);
    setActiveSource(null);
    setLastEvent(undefined);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, [panelId]);

  const setProfileJson = useCallback(
    (value: string) => {
      setProfileJsonInternal(value);
      persistProfile(panelId, value);
    },
    [panelId],
  );

  const ensureStream = useCallback(() => {
    if (typeof window === "undefined") return;
    if (eventSourceRef.current) return;
    if (!("EventSource" in window)) {
      setStatus({
        level: "error",
        message: "EventSource unavailable in this browser; live updates will not stream.",
      });
      return;
    }
    const topic = encodeURIComponent(panelId);
    const es = new EventSource(`${STREAM_PATH}?topic=${topic}`);
    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        setLastEvent({ type: payload?.type ?? "message", payload, receivedAt: Date.now() });
        setStatus({
          level: "ok",
          source: activeSource ?? undefined,
          message: "Streaming",
          timestamp: Date.now(),
        });
      } catch {
        setLastEvent({ type: "message", payload: event.data, receivedAt: Date.now() });
      }
    };
    es.onerror = () => {
      setStatus({
        level: "error",
        source: activeSource ?? undefined,
        message: "Stream error; will retry automatically.",
        timestamp: Date.now(),
      });
    };
    eventSourceRef.current = es;
  }, [panelId, activeSource]);

  useEffect(() => {
    if (isLive) {
      ensureStream();
    } else if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, [ensureStream, isLive]);

  const disconnect = useCallback(() => {
    setIsLive(false);
    setActiveSource(null);
    setStatus({ level: "idle" });
    setLastEvent(undefined);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const connectViaBridge = useCallback(
    async (opts?: { profileOverride?: unknown }) => {
      setStatus({ level: "pending", source: "bridge", message: "Connecting via LabBridge..." });
      try {
        const hasOverride = opts && Object.prototype.hasOwnProperty.call(opts, "profileOverride");
        let profilePayload: unknown;

        if (hasOverride) {
          profilePayload = opts?.profileOverride;
        } else {
          const parsed = parseProfileString(profileJson);
          if (!parsed.ok) {
            setStatus({ level: "error", source: "bridge", message: parsed.message });
            setIsLive(false);
            return;
          }
          if (parsed.pretty !== profileJson) {
            persistProfile(panelId, parsed.pretty);
            setProfileJsonInternal(parsed.pretty);
          }
          profilePayload = parsed.obj;
        }

        const res = await apiRequest("POST", STREAM_PATH, {
          panelId,
          profile: profilePayload ?? {},
          source: "bridge",
          action: "connect",
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Bridge connect failed");
        }
        setActiveSource("bridge");
        setIsLive(true);
        setStatus({
          level: "ok",
          source: "bridge",
          message: "Bridge connected",
          timestamp: Date.now(),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatus({ level: "error", source: "bridge", message });
        setIsLive(false);
      }
    },
    [panelId, profileJson],
  );

  const connectFromProfile = useCallback(
    async (value: string) => {
      const parsed = parseProfileString(value);
      if (!parsed.ok) {
        setStatus({ level: "error", source: "bridge", message: parsed.message });
        setIsLive(false);
        return;
      }
      persistProfile(panelId, parsed.pretty);
      setProfileJsonInternal(parsed.pretty);
      await connectViaBridge({ profileOverride: parsed.obj });
    },
    [panelId, connectViaBridge],
  );

  const postRow = useCallback(
    async (row: Record<string, unknown>) => {
      if (!fileIngest) return;
      await apiRequest("POST", fileIngest.endpoint, row);
    },
    [fileIngest],
  );

  const ingestTouchstone = useCallback(
    async (file: File) => {
      if (!fileIngest || fileIngest.kind !== "spectrum") return 0;
      const text = await file.text();
      const rows = parseTouchstone(text);
      if (!rows.length) return 0;
      const payload = {
        panelId,
        f_Hz: rows.map((row) => row.f_Hz),
        P_dBm: rows.map((row) => row.P_dBm),
        RBW_Hz: undefined,
        provenance: "file",
      };
      await apiRequest("POST", fileIngest.endpoint, payload);
      return rows.length;
    },
    [fileIngest, panelId],
  );

  const ingestCsv = useCallback(
    async (file: File) => {
      if (!fileIngest) return 0;
      const text = await file.text();
      const rows = parseCsv(text);
      let processed = 0;
      for (const row of rows) {
        const normalized = mapRowByKind(fileIngest.kind, row);
        await postRow(normalized);
        processed += 1;
      }
      return processed;
    },
    [fileIngest, postRow],
  );

  const ingestJson = useCallback(
    async (file: File) => {
      if (!fileIngest) return 0;
      const text = await file.text();
      const parsed = JSON.parse(text);
      const rows = ensureArray(parsed);
      let processed = 0;
      for (const row of rows) {
        const normalized = mapRowByKind(fileIngest.kind, row as Record<string, unknown>);
        await postRow(normalized);
        processed += 1;
      }
      return processed;
    },
    [fileIngest, postRow],
  );

  const ingestFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!fileIngest) {
        setStatus({
          level: "error",
          source: "files",
          message: "File ingestion not configured for this panel.",
        });
        return;
      }
      const inputs = Array.isArray(files) ? files : Array.from(files);
      if (!inputs.length) return;
      setStatus({ level: "pending", source: "files", message: "Uploading file data..." });
      try {
        let total = 0;
        for (const file of inputs) {
          const lower = file.name.toLowerCase();
          if (lower.endsWith(".json")) {
            total += await ingestJson(file);
          } else if (lower.endsWith(".csv")) {
            total += await ingestCsv(file);
          } else if (isTouchstone(file.name)) {
            total += await ingestTouchstone(file);
          } else {
            throw new Error(`Unsupported file type: ${file.name}`);
          }
        }
        setStatus({
          level: "ok",
          source: "files",
          message: `Uploaded ${total} record${total === 1 ? "" : "s"}`,
          timestamp: Date.now(),
        });
        setActiveSource("files");
        setIsLive(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatus({ level: "error", source: "files", message });
      }
    },
    [fileIngest, ingestCsv, ingestJson, ingestTouchstone],
  );

  const connectDirect = useCallback(async () => {
    const hasWebSerial = typeof navigator !== "undefined" && "serial" in navigator;
    const hasWebUsb = typeof navigator !== "undefined" && "usb" in navigator;
    if (!hasWebSerial && !hasWebUsb) {
      setStatus({
        level: "error",
        source: "direct",
        message: "WebSerial/WebUSB not available in this browser. Use the LabBridge path.",
      });
      return;
    }
    setStatus({
      level: "pending",
      source: "direct",
      message: "Requesting device access…",
    });
    try {
      if (hasWebSerial) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const serial = (navigator as any).serial;
        await serial.requestPort();
      } else if (hasWebUsb) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const usb = (navigator as any).usb;
        await usb.requestDevice({ filters: [] });
      }
      setStatus({
        level: "ok",
        source: "direct",
        message: "Device access granted (beta draft). Use LabBridge for production feeds.",
        timestamp: Date.now(),
      });
      setActiveSource("direct");
      setIsLive(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ level: "error", source: "direct", message });
      setIsLive(false);
    }
  }, []);

  return useMemo(
    () => ({
      panelId,
      panelTitle,
      help,
      open,
      setOpen,
      status,
      profileJson,
      setProfileJson,
      connectViaBridge,
      connectFromProfile,
      ingestFiles,
      connectDirect,
      disconnect,
      isLive,
      activeSource,
      lastEvent,
    }),
    [
      panelId,
      panelTitle,
      help,
      open,
      status,
      profileJson,
      setProfileJson,
      connectViaBridge,
      connectFromProfile,
      ingestFiles,
      connectDirect,
      disconnect,
      isLive,
      activeSource,
      lastEvent,
    ],
  );
}
