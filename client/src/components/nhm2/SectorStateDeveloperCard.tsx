import { useId, useState } from "react";
import HardwareConnectButton from "@/components/HardwareConnectButton";
import { useHardwareFeeds, type HardwareConnectHelp } from "@/hooks/useHardwareFeeds";
import { useSectorStateBusRelay } from "@/hooks/useSectorStateBusRelay";

const SECTOR_STATE_PROFILE = JSON.stringify({
  profileId: "demo-sector-state",
  description: "Sector strobe controller snapshot",
  streams: [{
    topic: "hardware/sector-state",
    ingest: {
      type: "grpc",
      endpoint: "grpc://strobe-controller.lab:50051",
      method: "SectorStateService/GetSnapshot",
      intervalMs: 200,
    },
    normalize: {
      endpoint: "/api/helix/hardware/sector-state",
      map: {
        current_sector: "currentSector",
        active_sectors: "activeSectors",
        concurrency: "sectorsConcurrent",
        sector_count: "sectorCount",
        dwell_ms: "dwell_ms",
        burst_ms: "burst_ms",
        burst_us: "burst_us",
        cycle_us: "cycle_us",
        strobe_hz: "strobeHz",
        modulation_freq_hz: "modulationFreq_Hz",
        modulation_freq_ghz: "modulationFreq_GHz",
        pulse_freq_hz: "pulseFrequency_Hz",
        pulse_freq_ghz: "pulseFrequency_GHz",
        duty_cycle: "measuredDutyCycle",
        duty_effective_fr: "measuredSectorDuty",
        cavity_q: "cavityQ",
        gamma_geo: "gammaGeo",
        gamma_vdb: "gammaVanDenBroeck",
        q_spoiling: "qSpoilingFactor",
        q_mechanical: "qMechanical",
        phase_schedule: "phaseScheduleTelemetry",
        phase01: "phase01",
        phase_cont: "phaseCont",
        pump_deg: "pumpPhase_deg",
        tau_lc_ms: "tauLC_ms",
      },
    },
  }],
}, null, 2);

const HELP: HardwareConnectHelp = {
  instruments: ["Strobe controller", "Optical/atomic clock"],
  feeds: [
    "POST /api/helix/hardware/sector-state (currentSector, sectorsConcurrent, dwell_ms, burst_ms, strobeHz, phaseScheduleTelemetry, phase01, phaseCont, pumpPhase_deg, tauLC_ms)",
    "Optional measured controls: modulationFreq_Hz/GHz, pulseFrequency_Hz/GHz, duty_cycle, sectorCount, cavityQ, gammaGeo, gammaVdB, qSpoilingFactor, qMechanical.",
  ],
  notes: [
    "Bridge prefers hardware phase01/phaseCont, pumpPhase_deg, tauLC_ms when present for Alcubierre viewer",
    "Stream updates over the hardware bus; relay is an explicit local display action",
  ],
  fileTypes: [".json snapshots"],
  profiles: [{
    name: "Sector Strobe Snapshot",
    description: "gRPC poll via LabBridge",
    json: SECTOR_STATE_PROFILE,
  }],
};

export default function SectorStateDeveloperCard() {
  const toggleId = useId();
  const [relayEnabled, setRelayEnabled] = useState(false);
  const hardware = useHardwareFeeds({
    panelId: "sector-state",
    panelTitle: "Sector-state hardware feed",
    help: HELP,
    fileIngest: {
      endpoint: "/api/helix/hardware/sector-state",
      kind: "sector-state",
    },
  });
  useSectorStateBusRelay(hardware, relayEnabled, { minPublishMs: 100 });

  return <section className="space-y-3 rounded border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-100">
    <div>
      <h3 className="font-semibold">Sector-state hardware feed</h3>
      <p className="text-xs text-amber-200">
        Connect or ingest a controller snapshot, then optionally relay valid timing frames to the local visualization bus.
        A connected feed or relay frame is not a selected-run NHM2 source, QEI result, or metric proof.
      </p>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <HardwareConnectButton controller={hardware} />
      <label htmlFor={toggleId} className="flex items-center gap-2 text-xs text-slate-300">
        <input id={toggleId} type="checkbox" checked={relayEnabled}
          onChange={(event) => setRelayEnabled(event.target.checked)} />
        Relay valid frames to local sector bus
      </label>
    </div>
    <dl className="grid gap-2 text-xs sm:grid-cols-2">
      <div><dt className="text-slate-400">Connection</dt><dd>{hardware.status.level}: {hardware.status.message ?? "no message"}</dd></div>
      <div><dt className="text-slate-400">Source</dt><dd>{hardware.activeSource ?? "none"}</dd></div>
      <div><dt className="text-slate-400">Last event</dt><dd>{hardware.lastEvent?.type ?? "none"}</dd></div>
      <div><dt className="text-slate-400">Received at</dt><dd>{hardware.lastEvent ? new Date(hardware.lastEvent.receivedAt).toLocaleString() : "none"}</dd></div>
    </dl>
  </section>;
}
