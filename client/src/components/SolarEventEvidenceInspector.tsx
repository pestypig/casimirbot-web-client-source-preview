import React from 'react';
import { buildSolarEventImageContext } from '../../../shared/solar-event-image-context';
import { solarHekEventRecordUrl } from '../../../shared/solar-hek-event-link';
import { solarHekReferenceUrls } from '../../../shared/solar-hek-reference-links';

export function SolarEventEvidenceInspector({ event, frame, observation, archivedSelection = false }: {
  event: (Parameters<typeof buildSolarEventImageContext>[0] & { reference_urls?: unknown }) | null;
  frame: Parameters<typeof buildSolarEventImageContext>[1];
  observation: Parameters<typeof buildSolarEventImageContext>[2];
  archivedSelection?: boolean;
}) {
  if (!event) return <p className="text-xs text-slate-400">Select a HEK event to inspect its image context and provenance gaps.</p>;
  const context = buildSolarEventImageContext(event, frame, observation);
  const recordUrl = solarHekEventRecordUrl(context.eventId);
  const referenceUrls = solarHekReferenceUrls(event.reference_urls);
  const offset = context.imageOffsetFromEventStartSeconds;
  return <section aria-label="Selected event image context" className="rounded border border-cyan-700/50 bg-slate-950/60 p-3 text-xs space-y-1">
    <p className="font-semibold text-cyan-100">Selected event · image context only</p>
    <p className="break-all font-mono">{context.eventId ?? 'No stable source event ID'} · {context.eventType}</p>
    {recordUrl && <p><a href={recordUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-200 underline">
      Look up declared IVORN in the HEK event registry</a> · registry content and revision not checked by this panel.</p>}
    {referenceUrls.length > 0 && <div>
      <p>HEK-declared references · destinations, content and revisions not verified here:</p>
      <ul className="list-disc pl-5">{referenceUrls.map((url, index) =>
        <li key={url}><a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-cyan-200 underline">
          Reference {index + 1}: {new URL(url).hostname}</a></li>)}</ul>
    </div>}
    <p>Reported event: {context.eventStartUtc ?? 'unknown'} to {context.eventEndUtc ?? 'unknown'}</p>
    <p>{archivedSelection ? 'Saved selection image' : 'Selected image'}: {context.imageTimeUtc ?? 'none'} · {context.instrument ?? 'unknown instrument'} {context.wavelengthAngstrom ?? 'unknown'} Å</p>
    <p>Image offset from event start: {offset === null ? 'unknown' : `${offset >= 0 ? '+' : ''}${offset.toFixed(1)} s`}
      {' · '}within reported interval: {context.imageWithinReportedEvent === null ? 'unknown' : context.imageWithinReportedEvent ? 'yes' : 'no'}</p>
    <p>Detection method: {context.detectionMethod ?? 'not supplied'} · retrieved: {context.fetchedAtUtc ?? 'unknown'}</p>
    <p className="break-all">Declared image snapshot ID: {context.archiveSnapshotId ?? 'none'}</p>
    {context.missing.length > 0 && <p className="text-amber-200">Missing: {context.missing.join('; ')}.</p>}
    <p className="text-slate-400">A nearby image and an event report are separate products. This view does not establish causation, a calibrated image measurement, or an interior-model constraint. A declared snapshot ID does not prove owner retention; the replay preserves this selection only, not the HEK event stream.</p>
  </section>;
}
