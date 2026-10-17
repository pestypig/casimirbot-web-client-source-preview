import HardwareConnectButton from "@/components/HardwareConnectButton";
import { useHardwareFeeds, type HardwareConnectHelp } from "@/hooks/useHardwareFeeds";

const SPECTRUM_PROFILE = JSON.stringify({
  profileId: "demo-spectrum",
  description: "Example VNA CSV tail to REST frame",
  streams: [{
    topic: "hardware/spectrum",
    ingest: { type: "file-tail", path: "\\\\daq1\\logs\\vna\\live.csv", delimiter: ",", pollMs: 1500 },
    normalize: {
      endpoint: "/api/helix/spectrum",
      mapStatic: { center_GHz: 9.86, RBW_Hz: 1000, ref_dBm: 0 },
      mapArray: { frequency_Hz: "f_Hz", power_dBm: "P_dBm" },
    },
  }],
}, null, 2);

const SPECTRUM_HELP: HardwareConnectHelp = {
  instruments: ["VNA / RSA", "Thermometer", "Q loader"],
  feeds: ["POST /api/helix/spectrum (f_Hz[], P_dBm[])"],
  notes: ["The example profile and incoming stream are diagnostics until a typed measurement receipt binds them to a run."],
  fileTypes: [".csv", ".snp/.s2p/.sNp"],
  profiles: [{ name: "VNA Tail to REST frame", description: "Example CSV tail through LabBridge", json: SPECTRUM_PROFILE }],
};

export default function SpectrumIngestDiagnosticCard() {
  const hardware = useHardwareFeeds({
    panelId: "spectrum-tuner",
    panelTitle: "Spectrum hardware feed",
    help: SPECTRUM_HELP,
    fileIngest: { endpoint: "/api/helix/spectrum", kind: "spectrum" },
  });

  return (
    <section className="space-y-3 text-slate-100">
      <h3 className="text-sm font-semibold">Spectrum hardware feed</h3>
      <p className="text-xs text-amber-200">
        This developer control can connect or ingest VNA data. Its stream status is not a measured-spectrum
        receipt bound to the selected NHM2 campaign, and it cannot establish source closure or viability.
      </p>
      <HardwareConnectButton controller={hardware} />
      <dl className="grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded border border-slate-800 p-2"><dt className="text-slate-400">Connection</dt><dd>{hardware.status.level}: {hardware.status.message ?? "no message"}</dd></div>
        <div className="rounded border border-slate-800 p-2"><dt className="text-slate-400">Source</dt><dd>{hardware.activeSource ?? "none"}</dd></div>
        <div className="rounded border border-slate-800 p-2"><dt className="text-slate-400">Last event</dt><dd>{hardware.lastEvent?.type ?? "none"}</dd></div>
        <div className="rounded border border-slate-800 p-2"><dt className="text-slate-400">Received at</dt><dd>{hardware.lastEvent ? new Date(hardware.lastEvent.receivedAt).toLocaleString() : "none"}</dd></div>
      </dl>
    </section>
  );
}
