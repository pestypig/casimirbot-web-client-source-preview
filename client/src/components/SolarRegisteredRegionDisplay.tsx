import React from "react";
import { Button } from "@/components/ui/button";

export type RegisteredRegionDisplay = {
  noaaNumber: number;
  location: string;
  category: "sunspot" | "plage";
  spotCount: number | null;
  spotClass: string | null;
  magneticClass: string | null;
  pixelX: number | null;
  pixelY: number | null;
  visible: boolean;
  omissionReason: string | null;
};

export type RegisteredRegionImageDisplay = {
  imageUrl: string;
  sourceUrl: string;
  sha256: string;
  upstreamImageId: string;
  observationAt: string;
  widthPx: number;
  heightPx: number;
  stale: boolean;
};

export type RegisteredRegionReportDisplay = {
  sourceUrl: string;
  sourceSha256: string;
  validAt: string;
  issuedAt: string;
};

type Props = {
  image: RegisteredRegionImageDisplay;
  report: RegisteredRegionReportDisplay;
  regions: RegisteredRegionDisplay[];
  projectionLabel: string;
  onExit: () => void;
  onRefresh: () => void;
  onImageError: () => void;
};

function hasOnImagePoint(region: RegisteredRegionDisplay, image: RegisteredRegionImageDisplay): region is RegisteredRegionDisplay & { pixelX: number; pixelY: number } {
  return region.visible && region.category === "sunspot" &&
    region.pixelX !== null && region.pixelY !== null &&
    Number.isFinite(region.pixelX) && Number.isFinite(region.pixelY) &&
    region.pixelX >= 0 && region.pixelX < image.widthPx &&
    region.pixelY >= 0 && region.pixelY < image.heightPx;
}

export function SolarRegisteredRegionDisplay({ image, report, regions, projectionLabel, onExit, onRefresh, onImageError }: Props) {
  const [selectedNumber, setSelectedNumber] = React.useState<number | null>(null);
  React.useEffect(() => setSelectedNumber(null), [image.sha256, report.sourceSha256]);
  const sunspots = regions.filter(region => region.category === "sunspot");
  const selected = sunspots.find(region => region.noaaNumber === selectedNumber) ?? null;
  const onDiskCount = sunspots.filter(region => hasOnImagePoint(region, image)).length;

  return <section aria-label="Registered NOAA region view" className="space-y-3 text-xs text-slate-300">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="text-sm font-medium text-slate-100">NOAA report positions on an exact HMI image</h3>
        <p className="mt-1 text-amber-200">Geometrically projected NOAA report locations under a fixed-Carrington assumption, not observed sunspot pixels, magnetic field lines, or image segmentation.</p>
        {image.stale && <p className="mt-1 font-semibold text-rose-200">Stale HMI image: this registered view is historical, not a current solar disk.</p>}
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onRefresh}>Refresh registered view</Button>
        <Button type="button" size="sm" variant="outline" onClick={onExit}>Return to latest image</Button>
      </div>
    </div>
    <div className="grid place-items-center rounded border border-slate-800 bg-black p-2">
      <div className="relative w-full max-w-md" style={{ aspectRatio: `${image.widthPx} / ${image.heightPx}` }}>
        <img src={image.imageUrl} alt="Exact Helioviewer HMI image paired with projected NOAA daily regions"
          onError={onImageError}
          className="absolute inset-0 h-full w-full" />
        {sunspots.filter((region): region is RegisteredRegionDisplay & { pixelX: number; pixelY: number } => hasOnImagePoint(region, image)).map(region =>
          <button key={region.noaaNumber} type="button" aria-label={`Projected NOAA ${region.noaaNumber} on HMI image`}
            aria-pressed={selectedNumber === region.noaaNumber} title={`NOAA ${region.noaaNumber} · ${region.location}`}
            onClick={() => setSelectedNumber(region.noaaNumber)}
            className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold shadow-[0_1px_4px_#000] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200 ${selectedNumber === region.noaaNumber ? "border-cyan-100 bg-cyan-500 text-black" : "border-amber-300 bg-slate-950/80 text-amber-100"}`}
            style={{ left: `${region.pixelX / image.widthPx * 100}%`, top: `${region.pixelY / image.heightPx * 100}%` }}>
            {region.noaaNumber}
          </button>)}
      </div>
    </div>
    <p>{onDiskCount} of {sunspots.length} numbered sunspot regions project onto this image. Off-disk or unprojectable regions remain in the catalog without a marker.</p>
    <p>Image observed: <time dateTime={image.observationAt}>{image.observationAt}</time> · NOAA positions valid: <time dateTime={report.validAt}>{report.validAt}</time> · report issued: <time dateTime={report.issuedAt}>{report.issuedAt}</time></p>
    <p>{projectionLabel}</p>
    <ul aria-label="Registered NOAA sunspot regions" className="max-h-48 overflow-auto rounded border border-slate-700">
      {sunspots.map(region => <li key={region.noaaNumber}>
        <button type="button" aria-pressed={selectedNumber === region.noaaNumber} onClick={() => setSelectedNumber(region.noaaNumber)}
          className={`flex w-full flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-2 py-2 text-left last:border-0 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 ${selectedNumber === region.noaaNumber ? "bg-cyan-500/10 text-cyan-100" : ""}`}>
          <span>NOAA {region.noaaNumber}</span><span>{region.location}</span>
          <span>{hasOnImagePoint(region, image) ? "projected on image" : "no image marker"}</span>
        </button>
      </li>)}
    </ul>
    {selected && <section aria-label={`NOAA ${selected.noaaNumber} registered details`} className="rounded border border-cyan-700/40 bg-slate-950/80 p-2">
      <p className="font-medium text-cyan-100">NOAA {selected.noaaNumber} · {selected.location}</p>
      <p>Magnetic class: {selected.magneticClass ?? "not reported"} · spot class: {selected.spotClass ?? "not reported"} · spot count: {selected.spotCount ?? "not reported"}</p>
      <p>{hasOnImagePoint(selected, image) ? `Projected image pixel: ${selected.pixelX.toFixed(1)}, ${selected.pixelY.toFixed(1)} (origin at top left)` : `No image marker${selected.omissionReason ? `: ${selected.omissionReason}` : "."}`}</p>
    </section>}
    <div className="space-y-1 break-all font-mono text-[10px] text-slate-400">
      <p>Helioviewer image ID: {image.upstreamImageId} · SHA-256: {image.sha256}</p>
      <p>NOAA report SHA-256: {report.sourceSha256}</p>
    </div>
    <div className="flex flex-wrap gap-3">
      <a href={image.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-200 underline">Open exact HMI image source</a>
      <a href={report.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-200 underline">Open NOAA report</a>
    </div>
  </section>;
}
