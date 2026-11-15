import React from "react";
import {readSolarPatrolCatalogView,solarCitationHref,type SolarPatrolCatalogView} from "@/lib/solar-catalog-view";
import { readCachedAccountProfileIdentity, HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";

type Catalog=SolarPatrolCatalogView;
const hash = /^[a-f0-9]{64}$/;
export function parsePatrolViewed(value: string | null): Record<string, string> {
  try {
    const parsed = JSON.parse(value ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? Object.fromEntries(Object.entries(parsed).filter(([key, value]) => key.startsWith("donki:") && typeof value === "string" && hash.test(value)).slice(-256)) as Record<string, string>
      : {};
  } catch { return {}; }
}
export function SolarPatrolArtifacts({ dayUtc }: { dayUtc: string | null }) {
  const [profile, setProfile] = React.useState(readCachedAccountProfileIdentity);
  const [catalog, setCatalog] = React.useState<Catalog | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [seen, setSeen] = React.useState<Record<string, string>>({});
  const [source, setSource] = React.useState<"domain" | "installation">("domain");
  const origin = source === "domain" ? "https://casimirbot.com" : "";
  const key = profile.profileId ? `casimir.solar-patrol.viewed.v1:${encodeURIComponent(profile.profileId)}` : null;
  React.useEffect(() => {
    const changed = () => setProfile(readCachedAccountProfileIdentity());
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, changed);
    return () => window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, changed);
  }, []);
  React.useEffect(() => {
    try { setSeen(key ? parsePatrolViewed(window.localStorage.getItem(key)) : {}); }
    catch { setSeen({}); }
  }, [key]);
  React.useEffect(() => {
    const controller = new AbortController(); let busy = false; setCatalog(null);
    const load = async () => {
      if (busy) return; busy = true;
      try {
        const end = dayUtc ? Date.parse(`${dayUtc}T00:00:00Z`) + 24 * 3_600_000 : Math.floor(Date.now() / 3_600_000) * 3_600_000;
        const query = new URLSearchParams({ start: new Date(end - 24 * 3_600_000).toISOString(), end: new Date(end).toISOString() });
        const response = await fetch(`/api/star-watcher/patrol${source === "domain" ? "/domain" : ""}?${query}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("unavailable");
        const result = readSolarPatrolCatalogView(await response.json(),query.get("start")!,query.get("end")!);
        if (!controller.signal.aborted) { setCatalog(result); setFailed(false); }
      } catch { if (!controller.signal.aborted) setFailed(true); } finally { busy = false; }
    };
    void load(); const timer = window.setInterval(() => { void load(); }, 5 * 60_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [dayUtc, profile.revision, source]);
  const unseen = catalog?.reports.filter(r => seen[r.id] !== r.revisionSha256).length ?? 0;
  const markViewed = () => {
    if (!key || readCachedAccountProfileIdentity().profileId !== profile.profileId) return;
    const next = Object.fromEntries([...Object.entries(seen), ...(catalog?.reports ?? []).map(r => [r.id, r.revisionSha256] as const)].slice(-256));
    try { window.localStorage.setItem(key, JSON.stringify(next)); setSeen(next); } catch { /* Viewing never grants delivery authority. */ }
  };
  return <section aria-label="Independent solar patrol artifacts" className="mt-4 space-y-2 rounded border border-cyan-800 p-3">
    <h3 className="font-semibold">Solar patrol · independent source context</h3>
    <label className="block text-xs">Artifact catalog <select aria-label="Patrol artifact catalog" value={source}
      onChange={event => setSource(event.target.value as "domain" | "installation")} className="rounded border border-cyan-700 bg-slate-950 px-2 py-1">
      <option value="domain">CasimirBot domain · distributed reports and movies</option>
      <option value="installation">This installation · locally retained artifacts</option>
    </select></label>
    <p className="text-xs text-slate-400">NASA DONKI reports remain separate from HEK. Browse imagery supports morphology; it does not measure released energy or coronal magnetic-field strength.</p>
    {key && <button type="button" onClick={markViewed} className="rounded border border-cyan-700 px-2 py-1 text-xs">{unseen} new or revised since last viewed · Mark viewed</button>}
    {failed && <p role="status" className="text-xs text-amber-200">Patrol read unavailable; any retained view may be stale.</p>}
    {catalog && <p className="text-xs text-slate-400">DONKI coverage: {catalog.coverage.status}; fetched {catalog.coverage.fetchedAt ?? "not retained for this exact window"}. Late reports and backfill can change coverage.</p>}
    {catalog?.reports.map(r => <details key={r.id} className="rounded border border-slate-800 p-2 text-xs">
      <summary>{r.nativeId} · version {r.version} {seen[r.id] !== r.revisionSha256 && key ? "· new/revised" : ""}</summary>
      <p>First observed: {r.occurredAt} · Report submitted: {r.submittedAt ?? "unavailable"} · CasimirBot first saw: {r.firstSeenAt}</p>
      <p className="my-1 whitespace-pre-wrap">NASA analyst report: {r.note}</p>
      <p>Source location: {r.sourceLocation ?? "unassigned"} · NOAA region: {r.activeRegion ?? "unassigned"}</p>
      {r.analysis && <p>Source analysis: speed {r.analysis.speedKmS ?? "unavailable"} km/s; latitude {r.analysis.latitudeDeg ?? "unavailable"}°, longitude {r.analysis.longitudeDeg ?? "unavailable"}°; half-angle {r.analysis.halfAngleDeg ?? "unavailable"}°; {r.analysis.technique ?? "technique unavailable"}. This is the cited analyst's result.</p>}
      <a href={solarCitationHref(r.citation)} target="_blank" rel="noreferrer" className="text-cyan-300 underline">NASA source report</a>
    </details>)}
    {catalog && !catalog.reports.length && <p className="text-xs text-slate-400">No retained DONKI reports in this window; this does not establish absence of solar activity.</p>}
    {catalog?.reels.filter(r => hash.test(r.reelId)).map(r => <div key={r.reelId} className="space-y-1 text-xs">
      <p>Retained patrol artifact: {r.windowStartUtc}–{r.windowEndUtc}</p>
      <video controls preload="none" src={`${origin}/api/star-watcher/hek-reel/${r.reelId}.mp4`} className="w-full max-w-lg rounded" aria-label="Retained solar patrol sequence" />
      <p>{r.patrol.frames.length} source frames · {r.patrol.unavailable.length} unavailable slots · {r.patrol.excludedReportIds.length} reports outside the two-sequence media budget</p>
      <p className="break-all">SHA-256: {r.outputSha256}</p>
      <a href={`${origin}/api/star-watcher/patrol/reels/${r.reelId}`} target="_blank" rel="noreferrer" className="text-cyan-300 underline">Verified artifact manifest and source clocks</a>
    </div>)}
  </section>;
}
