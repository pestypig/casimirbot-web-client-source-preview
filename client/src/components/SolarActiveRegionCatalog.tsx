import React from "react";
import { Button } from "@/components/ui/button";

type Region = {
  noaaNumber: number;
  latitudeDeg: number;
  centralMeridianDistanceDeg: number;
  carringtonLongitudeDeg: number;
  location: string;
  spotCount: number | null;
  spotClass: string | null;
  magneticClass: string | null;
  areaMillionths: number | null;
  category: "sunspot" | "plage";
};

type CurrentRegions = {
  schemaVersion: "solar-active-regions-current/1";
  sourceUrl: string;
  sourceSha256: string;
  issuedAt: string;
  validAt: string;
  fetchedAt: string;
  complete: true;
  regions: Region[];
};

const CURRENT_REGIONS_URL = "/api/star-watcher/active-regions/current";
const NOAA_REPORT_URL = "https://services.swpc.noaa.gov/text/srs.txt";

function isCurrentRegions(value: unknown): value is CurrentRegions {
  if (!value || typeof value !== "object") return false;
  const report = value as Partial<CurrentRegions>;
  return report.schemaVersion === "solar-active-regions-current/1" && report.complete === true &&
    report.sourceUrl === NOAA_REPORT_URL &&
    typeof report.sourceSha256 === "string" && /^[a-f0-9]{64}$/.test(report.sourceSha256) &&
    typeof report.issuedAt === "string" && Number.isFinite(Date.parse(report.issuedAt)) &&
    typeof report.validAt === "string" && Number.isFinite(Date.parse(report.validAt)) &&
    typeof report.fetchedAt === "string" && Number.isFinite(Date.parse(report.fetchedAt)) &&
    Array.isArray(report.regions) && report.regions.every(region =>
      region && typeof region === "object" &&
      Number.isInteger(region.noaaNumber) && region.noaaNumber > 0 &&
      Number.isFinite(region.latitudeDeg) && Math.abs(region.latitudeDeg) <= 90 &&
      Number.isFinite(region.centralMeridianDistanceDeg) && Math.abs(region.centralMeridianDistanceDeg) <= 180 &&
      Number.isFinite(region.carringtonLongitudeDeg) && region.carringtonLongitudeDeg >= 0 &&
        region.carringtonLongitudeDeg <= 360 &&
      (region.category === "sunspot" || region.category === "plage") &&
      typeof region.location === "string" &&
      (region.spotCount === null || (Number.isInteger(region.spotCount) && region.spotCount >= 0)) &&
      (region.areaMillionths === null || (Number.isFinite(region.areaMillionths) && region.areaMillionths >= 0)) &&
      (region.spotClass === null || typeof region.spotClass === "string") &&
      (region.magneticClass === null || typeof region.magneticClass === "string"));
}

export function SolarActiveRegionCatalog({ onShowMagnetogram }: { onShowMagnetogram: () => void }) {
  const [report, setReport] = React.useState<CurrentRegions | null>(null);
  const [selectedNumber, setSelectedNumber] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(true);
  const refresh = React.useCallback(async (signal?: AbortSignal) => {
    setBusy(true);
    try {
      const response = await fetch(CURRENT_REGIONS_URL, { credentials: "same-origin", cache: "no-store", signal });
      if (!response.ok) throw new Error("daily region report unavailable");
      const value: unknown = await response.json();
      if (!isCurrentRegions(value)) throw new Error("daily region report invalid");
      if (signal?.aborted) return;
      setReport(value);
      setError(null);
      setSelectedNumber(previous => value.regions.some(region => region.noaaNumber === previous) ? previous : null);
    } catch {
      if (!signal?.aborted) setError("NOAA daily region report unavailable. An earlier report, if shown, may be out of date.");
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }, []);
  React.useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = window.setInterval(() => { void refresh(controller.signal); }, 30 * 60_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [refresh]);

  const sunspots = report?.regions.filter(region => region.category === "sunspot") ?? [];
  const plageCount = report?.regions.filter(region => region.category === "plage").length ?? 0;
  const selected = report?.regions.find(region => region.noaaNumber === selectedNumber) ?? null;
  const ageHours = report ? (Date.now() - Date.parse(report.validAt)) / 3_600_000 : null;
  const oldReport = ageHours !== null && (ageHours < -1 || ageHours > 36);

  return <section aria-label="NOAA daily active regions" className="rounded border border-slate-700 bg-slate-900/60 p-3 text-xs text-slate-300">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="text-sm font-medium text-slate-100">Latest NOAA-reported sunspot regions</h3>
        <p className="mt-1 text-slate-400">NOAA daily catalog; positions are report coordinates, not registered to the image above.</p>
      </div>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void refresh()}>Refresh regions</Button>
    </div>
    {report && <div className="mt-2 space-y-1 text-slate-400">
      <p>Position valid: <time dateTime={report.validAt}>{report.validAt}</time> · issued: <time dateTime={report.issuedAt}>{report.issuedAt}</time></p>
      <p>Checked: <time dateTime={report.fetchedAt}>{report.fetchedAt}</time>{oldReport ? " · old report; do not treat as current locations" : ""}</p>
      <p className="break-all font-mono text-[10px]">Report SHA-256: {report.sourceSha256}</p>
      <p>{sunspots.length} numbered sunspot regions{plageCount ? ` · ${plageCount} plage-only regions omitted from this list` : ""}</p>
    </div>}
    {error && <p role="status" className="mt-2 text-amber-200">{error}</p>}
    {busy && !report && <p role="status" className="mt-2 text-slate-400">Loading NOAA region report…</p>}
    {report && <>
      {sunspots.length ? <ul className="mt-2 max-h-48 overflow-auto rounded border border-slate-700" aria-label="Reported sunspot regions">
        {sunspots.map(region => <li key={region.noaaNumber}><button type="button" aria-pressed={selectedNumber === region.noaaNumber}
          onClick={() => setSelectedNumber(region.noaaNumber)}
          className={`flex w-full items-center justify-between gap-2 border-b border-slate-800 px-2 py-2 text-left last:border-0 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 ${selectedNumber === region.noaaNumber ? "bg-cyan-500/10 text-cyan-100" : ""}`}>
          <span className="font-medium">NOAA {region.noaaNumber}</span>
          <span>{region.location}</span>
          <span>{region.spotCount === null ? "spots —" : `${region.spotCount} spot${region.spotCount === 1 ? "" : "s"}`}</span>
        </button></li>)}
      </ul> : <p className="mt-2 text-slate-400">No numbered sunspot regions in this complete daily report.</p>}
      {selected && <section aria-label={`NOAA ${selected.noaaNumber} report details`} className="mt-2 rounded border border-cyan-700/40 bg-slate-950/80 p-2">
        <p className="font-medium text-cyan-100">NOAA {selected.noaaNumber} · {selected.location}</p>
        <p className="mt-1">Report latitude: {selected.latitudeDeg}° · central-meridian distance: {selected.centralMeridianDistanceDeg}° (west positive) · Carrington longitude: {selected.carringtonLongitudeDeg}°</p>
        <p className="mt-1">Magnetic class: {selected.magneticClass ?? "not reported"} · spot class: {selected.spotClass ?? "not reported"}</p>
        <p>Spot count: {selected.spotCount ?? "not reported"} · area: {selected.areaMillionths ?? "not reported"} millionths of solar hemisphere</p>
        <p className="mt-1 text-slate-400">A magnetic class is a catalog description, not a measured 3D magnetic field. The HMI magnetogram is a separate whole-disk image, not this region’s co-registered cutout.</p>
        <Button type="button" size="sm" variant="outline" className="mt-2" onClick={onShowMagnetogram}>View whole-disk magnetogram</Button>
      </section>}
      <a href={report.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-cyan-200 underline">Open NOAA source report</a>
    </>}
  </section>;
}
