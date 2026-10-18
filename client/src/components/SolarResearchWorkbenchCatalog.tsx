import React, { useEffect, useRef, useState } from 'react';
import { solarPackageCatalogSchema, type SolarPackageCatalog } from '../../../shared/solar-package-catalog';
import { solarLocalProductInventorySchema, type SolarLocalProductInventory } from '../../../shared/solar-local-product-inventory';
import { verifySolarResearchExport } from '../../../shared/solar-research-export';
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from '../lib/workstation/accountCapabilityPolicy';

type RetainedRecord = {
  recordId: string;
  createdAt: string;
  rowCount: number;
  fixtureOnly: boolean;
  hasModelDifference: boolean;
};
type RecordPage = {
  records: RetainedRecord[];
  totalRecords: number;
  rejectedCount: number;
  offset: number;
  nextOffset: number | null;
  admissionAllowed: false;
  scienceRunAllowed: false;
};
const recordIdPattern = /^solar-primary:[a-f0-9]{64}$/;
const catalogFailure = (result: {error?: unknown}, fallback: string) =>
  result?.error === 'api_not_found'
    ? 'Solar research API is absent from this desktop service. Rebuild the renderer and service together; no owner catalog was checked.'
    : typeof result?.error === 'string' ? result.error : fallback;

function parseRecordPage(value: unknown, offset: number): RecordPage {
  if (!value || typeof value !== 'object') throw new Error('Research record catalog rejected');
  const page = value as Partial<RecordPage>;
  if (page.offset !== offset || !Array.isArray(page.records) || page.records.length > 10 ||
      !Number.isInteger(page.totalRecords) || (page.totalRecords ?? -1) < 0 ||
      !Number.isInteger(page.rejectedCount) || (page.rejectedCount ?? -1) < 0 ||
      page.admissionAllowed !== false || page.scienceRunAllowed !== false ||
      (page.nextOffset !== null && (!Number.isInteger(page.nextOffset) || (page.nextOffset ?? 0) <= offset || (page.nextOffset ?? 0) > 99)) ||
      page.records.some(item => !recordIdPattern.test(item.recordId) || typeof item.createdAt !== 'string' ||
        !Number.isInteger(item.rowCount) || item.rowCount < 0 || item.rowCount > 76 ||
        typeof item.fixtureOnly !== 'boolean' || typeof item.hasModelDifference !== 'boolean'))
    throw new Error('Research record catalog rejected');
  return page as RecordPage;
}

export function SolarResearchWorkbenchCatalog({ observationLoaded = false, onOpenRecord, onOpenLocalRecord }: {
  observationLoaded?: boolean;
  onOpenRecord?: (recordId: string) => void;
  onOpenLocalRecord?: (bundle: unknown) => void;
}) {
  const [packages, setPackages] = useState<SolarPackageCatalog | null>(null);
  const [localProducts, setLocalProducts] = useState<SolarLocalProductInventory | null>(null);
  const [records, setRecords] = useState<RecordPage | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<RetainedRecord | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<SolarPackageCatalog['packages'][number] | null>(null);
  const [message, setMessage] = useState('Catalog not checked in this session.');
  const [busy, setBusy] = useState(false);
  const [ownerProfileId, setOwnerProfileId] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const clear = () => {
      generation.current++;
      request.current?.abort();
      setBusy(false); setPackages(null); setRecords(null); setLocalProducts(null); setOwnerProfileId(null); setSelectedRecord(null); setSelectedPackage(null);
      setMessage('Account changed. Refresh the owner catalog before using a record.');
    };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear);
    return () => { generation.current++; request.current?.abort(); window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear); };
  }, []);

  async function refresh(offset = 0) {
    request.current?.abort();
    const selected = ++generation.current;
    const controller = new AbortController(); request.current = controller;
    const current = () => selected === generation.current && !controller.signal.aborted;
    setBusy(true); setPackages(null); setRecords(null); setLocalProducts(null); setOwnerProfileId(null); setSelectedRecord(null); setSelectedPackage(null);
    setMessage('Checking the signed-in owner catalog…');
    try {
      const accountResponse = await fetch('/api/account/session', { signal: controller.signal });
      if (!accountResponse.ok) throw new Error('Account status unavailable');
      const account = await accountResponse.json();
      const profileId = account.session?.profile?.profile_id;
      if (!current()) return;
      if (typeof profileId !== 'string' || !profileId || account.account_policy?.account_type !== 'developer')
        throw new Error('A signed-in developer account is required to inspect retained research products');
      const query = new URLSearchParams({ expected_profile_id: profileId, offset: String(offset), limit: '10' });
      const [packageResponse, recordResponse, localResponse] = await Promise.all([
        fetch(`/api/account/solar-research/packages?${query}`, { signal: controller.signal }),
        fetch(`/api/account/solar-research/records?${query}`, { signal: controller.signal }),
        fetch(`/api/account/solar-research/local-products?expected_profile_id=${encodeURIComponent(profileId)}`, { signal: controller.signal }),
      ]);
      const [packageResult, recordResult, localResult] = await Promise.all([packageResponse.json(), recordResponse.json(), localResponse.json()]);
      if (!current()) return;
      if (!packageResponse.ok || packageResult.ok !== true || packageResult.profileId !== profileId)
        throw new Error(catalogFailure(packageResult, 'Owner package catalog unavailable'));
      if (!recordResponse.ok || recordResult.ok !== true || recordResult.profileId !== profileId)
        throw new Error(catalogFailure(recordResult, 'Owner research record catalog unavailable'));
      if (!localResponse.ok || localResult.ok !== true || localResult.profileId !== profileId)
        throw new Error(catalogFailure(localResult, 'Local research inventory unavailable'));
      const packagePayload = { ...packageResult }; delete packagePayload.ok; delete packagePayload.profileId;
      const recordPayload = { ...recordResult }; delete recordPayload.ok; delete recordPayload.profileId;
      const localPayload = { ...localResult }; delete localPayload.ok; delete localPayload.profileId;
      const parsedPackage = solarPackageCatalogSchema.safeParse(packagePayload);
      if (!parsedPackage.success) throw new Error('Package catalog identity or claim boundary rejected');
      const packagePage = parsedPackage.data;
      if (packagePage.offset !== offset || packagePage.packages.length > 10) throw new Error('Package catalog page rejected');
      const recordPage = parseRecordPage(recordPayload, offset);
      const parsedLocal = solarLocalProductInventorySchema.safeParse(localPayload);
      if (!parsedLocal.success) throw new Error('Local inventory identity or claim boundary rejected');
      setPackages(packagePage); setRecords(recordPage); setLocalProducts(parsedLocal.data); setOwnerProfileId(profileId);
      setMessage('Account pages and bounded local inputs were checked at read time. Other pages, source authentication and scientific admission are not implied.');
    } catch (error) {
      if (current()) setMessage(error instanceof Error ? error.message : 'Research catalog unavailable');
    } finally { if (current()) setBusy(false); }
  }

  async function openLocalObservation() {
    if (!ownerProfileId || busy) return;
    request.current?.abort();
    const selected = ++generation.current;
    const controller = new AbortController(); request.current = controller;
    const current = () => selected === generation.current && !controller.signal.aborted;
    setBusy(true); setMessage('Checking the frozen local observation inputs…');
    try {
      const query = new URLSearchParams({ expected_profile_id: ownerProfileId, product_id: 'g1.author.cdif' });
      const response = await fetch(`/api/account/solar-research/local-primary-observation?${query}`, { signal: controller.signal });
      const result = await response.json();
      if (!current()) return;
      if (!response.ok || result.ok !== true || result.profileId !== ownerProfileId || result.productId !== 'g1.author.cdif' ||
          result.admissionAllowed !== false || result.scienceRunAllowed !== false || result.sourceIdentityAuthenticated !== false)
        throw new Error(result.error ?? 'Local observation owner or claim boundary rejected');
      const verified = await verifySolarResearchExport(result.bundle);
      if (!current()) return;
      if (verified.recordId !== result.recordId || verified.record.fixtureOnly || verified.record.modelDifference !== null ||
          verified.record.rows.length !== 37) throw new Error('Local observation record identity rejected');
      onOpenLocalRecord?.(result.bundle);
      setMessage(`Opened ${verified.recordId} in Compare. Observations only; model prediction and covariance remain missing.`);
    } catch (error) {
      if (current()) setMessage(error instanceof Error ? error.message : 'Local observation unavailable');
    } finally { if (current()) setBusy(false); }
  }

  return <section id="solar-research-catalog" aria-label="Solar research workbench catalog" className="rounded border border-cyan-700/40 bg-slate-950/70 p-3 space-y-3 text-sm">
    <div>
      <h2 className="font-semibold text-slate-100">Research inputs and retained records</h2>
      <p className="text-xs text-slate-400">Inspect a fixed set of repository inputs and verified retained account records. This is not an unrestricted disk scan or a MESA run.</p>
    </div>
    <div className="grid gap-2 text-xs sm:grid-cols-3">
      <p>SunPy context: {observationLoaded ? 'loaded for display; not an interior measurement' : 'not loaded'}</p>
      <p>Calibrated MESA baseline: not established by this catalog</p>
      <p>Real seismic comparison: needs candidate, complete reference/operator and uncertainty treatment</p>
    </div>
    <button type="button" disabled={busy} onClick={() => void refresh()} className="rounded border border-cyan-600 px-3 py-1 text-cyan-100 disabled:opacity-50">Inspect research products</button>
    <p role="status" aria-live="polite" className="text-xs text-amber-100">{message}</p>
    {localProducts && <div aria-label="Local solar research inputs" className="space-y-2">
      <h3 className="font-medium">Known local inputs (checked against this runtime)</h3>
      {!localProducts.workspaceRootLocated && <p className="text-xs text-amber-100">No ancestor research checkout was found for this runtime. Missing entries here do not prove those files are absent elsewhere on the device.</p>}
      <div className="grid gap-2 lg:grid-cols-2">{localProducts.products.map(item => <div key={item.id} className="rounded border border-slate-700 p-2 text-xs">
        <p className="font-semibold">{item.id} · {item.state.replaceAll('_', ' ')}</p>
        <p className="break-all font-mono">{item.relativePath}</p>
        <p>{item.comparisonUse}</p>
        <p className="break-all text-slate-400">{item.sha256 ? `SHA256 ${item.sha256}` : 'No readable file hash in this runtime'}{item.bytes !== null ? ` · ${item.bytes} bytes` : ''}</p>
        {item.id === 'g1.author.cdif' && item.state === 'frozen_hash_matched' &&
          localProducts.products.some(kernel => kernel.id === 'g1.author.avker.bp04' && kernel.state === 'frozen_hash_matched') &&
          <button type="button" disabled={busy || !onOpenLocalRecord} onClick={() => void openLocalObservation()}
            className="mt-2 rounded border border-cyan-600 px-2 py-1 disabled:opacity-50">Open 37 observed rows in Compare</button>}
      </div>)}</div>
      <p className="text-xs text-amber-100">A frozen hash match verifies local bytes against the recorded freeze, not author provenance, a solver run, or G1 admission.</p>
    </div>}
    {packages && records && <div className="grid gap-3 lg:grid-cols-2">
      <div className="space-y-2">
        <h3 className="font-medium">Evidence packages ({packages.totalPackages})</h3>
        {packages.packages.length === 0 && <p className="text-xs text-slate-400">No packages on this page.</p>}
        {packages.packages.map(item => <button key={item.packageId} type="button" onClick={() => { setSelectedPackage(item); setSelectedRecord(null); }}
          className="block w-full rounded border border-slate-700 p-2 text-left text-xs hover:border-cyan-600">
          <span className="block break-all font-mono">{item.packageId}</span>
          <span>{item.comparisonRows} comparison rows · archive {item.archiveId ? 'linked' : 'absent'} · source identity not authenticated</span>
        </button>)}
      </div>
      <div className="space-y-2">
        <h3 className="font-medium">Research records ({records.totalRecords})</h3>
        {records.records.length === 0 && <p className="text-xs text-slate-400">No records on this page.</p>}
        {records.records.map(item => <button key={item.recordId} type="button" onClick={() => { setSelectedRecord(item); setSelectedPackage(null); }}
          className="block w-full rounded border border-slate-700 p-2 text-left text-xs hover:border-cyan-600">
          <span className="block break-all font-mono">{item.recordId}</span>
          <span>{item.rowCount} rows · {item.fixtureOnly ? 'fixture only' : item.hasModelDifference ? 'declared model-difference rows' : 'no model-difference rows'}</span>
        </button>)}
      </div>
    </div>}
    {selectedPackage && <div aria-label="Selected solar package" className="rounded border border-cyan-700/50 p-2 text-xs">
      <p className="break-all font-mono">{selectedPackage.packageId}</p>
      <p className="break-all">Comparison record: {selectedPackage.comparisonRecordId}</p>
      <p className="break-all">Archive: {selectedPackage.archiveId ?? 'absent'} · index: {selectedPackage.indexId}</p>
      <p>Integrity verified for this retained package; source identity and scientific admission remain unverified. Inspect its exact ID in the package archive controls below.</p>
    </div>}
    {selectedRecord && <div aria-label="Selected solar research record" className="rounded border border-cyan-700/50 p-2 text-xs">
      <p className="break-all font-mono">{selectedRecord.recordId}</p>
      <p>{selectedRecord.fixtureOnly ? 'Fixture: UI/test use only.' : selectedRecord.hasModelDifference ? 'Declared difference rows; this catalog does not authenticate a solver or complete seismic fit.' : 'Observation-side record; model prediction absent.'}</p>
      <p>Next gate: inspect the exact record, then check candidate/reference/operator and uncertainty support.</p>
      {onOpenRecord && <button type="button" onClick={() => onOpenRecord(selectedRecord.recordId)} className="mt-2 rounded border border-cyan-600 px-2 py-1">Inspect this record in Compare</button>}
    </div>}
    {packages && records && (packages.nextOffset !== null || records.nextOffset !== null) &&
      <p className="text-xs text-slate-400">More owner records exist. This first slice inspects only the first ten of each collection; no uninspected page is counted as verified detail.</p>}
  </section>;
}
