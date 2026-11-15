import React, { useEffect, useId, useRef, useState } from 'react';
import { inspectLocalConnectorFiles, LocalConnectorInspectionError,
  type LocalConnectorInspection, type LocalConnectorInspectionCode } from '@shared/local-connector-package-inspection';
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from '@/lib/workstation/accountCapabilityPolicy';

const errors: Record<LocalConnectorInspectionCode, string> = {
  archive_too_large: 'Choose an archive no larger than 8 MiB.',
  manifest_too_large: 'Choose a candidate manifest no larger than 256 KiB.',
  file_type_unsupported: 'Choose a .tgz archive and its .json candidate manifest.',
  file_read_failed: 'The selected files could not be read. Choose them again.',
  manifest_invalid: 'The candidate manifest is not valid UTF-8 JSON.',
  candidate_format_unsupported: 'This is not a supported unreviewed local candidate manifest. It cannot supply platform approval.',
  crypto_unavailable: 'Local SHA-256 checking is unavailable in this browser. No files were uploaded or installed.',
};

export default function LocalConnectorPackageInspection() {
  const id = useId();
  const archiveInput = useRef<HTMLInputElement>(null), manifestInput = useRef<HTMLInputElement>(null);
  const [archive, setArchive] = useState<File | null>(null), [manifest, setManifest] = useState<File | null>(null);
  const [result, setResult] = useState<LocalConnectorInspection | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const generation = useRef(0);
  const invalidate = () => { generation.current++; setResult(null); setBusy(false); setMessage(''); };
  const clear = () => {
    invalidate(); setArchive(null); setManifest(null);
    if (archiveInput.current) archiveInput.current.value = '';
    if (manifestInput.current) manifestInput.current.value = '';
  };
  useEffect(() => {
    const changed = () => clear();
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, changed);
    return () => { generation.current++; window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, changed); };
  }, []);
  const inspect = async () => {
    if (!archive || !manifest || busy) return;
    const current = ++generation.current;
    setBusy(true); setResult(null); setMessage('Checking selected files on this device…');
    try {
      const next = await inspectLocalConnectorFiles(archive, manifest);
      if (current !== generation.current) return;
      setResult(next);
      setMessage(next.status === 'checksum_matches' ? 'The archive checksum matches the selected candidate manifest.'
        : 'These files do not match. Obtain the matching archive and manifest before proceeding.');
    } catch (error) {
      if (current === generation.current) setMessage(error instanceof LocalConnectorInspectionError
        ? errors[error.code] : 'The files could not be checked. No files were uploaded or installed.');
    } finally { if (current === generation.current) setBusy(false); }
  };
  const input = 'mt-2 block w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-1 file:text-slate-100';
  const button = 'rounded-lg border border-slate-600 px-3 py-2 text-sm text-cyan-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300';
  return <section aria-labelledby={`${id}-heading`} className="mb-6 rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
    <h2 id={`${id}-heading`} className="text-lg font-semibold">Inspect a downloaded adapter</h2>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Choose the archive and candidate manifest explicitly. Files stay on this device. Inspection does not install or run code.</p>
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <label htmlFor={`${id}-archive`} className="text-sm font-medium">Adapter archive (.tgz)
        <input ref={archiveInput} id={`${id}-archive`} type="file" accept=".tgz" disabled={busy} className={input}
          onChange={event => { invalidate(); setArchive(event.currentTarget.files?.[0] ?? null); }} /></label>
      <label htmlFor={`${id}-manifest`} className="text-sm font-medium">Candidate manifest (.json)
        <input ref={manifestInput} id={`${id}-manifest`} type="file" accept=".json,application/json" disabled={busy} className={input}
          onChange={event => { invalidate(); setManifest(event.currentTarget.files?.[0] ?? null); }} /></label>
    </div>
    <div className="mt-4 flex flex-wrap gap-3"><button type="button" className={button} disabled={!archive || !manifest || busy} onClick={() => void inspect()}>
      {busy ? 'Checking files…' : 'Check selected files'}</button><button type="button" className={button} onClick={clear}>Clear selected files</button></div>
    <p role="status" aria-live="polite" className="mt-3 text-sm text-cyan-100">{message}</p>
    {result && <div className="mt-4 rounded-lg border border-slate-600 p-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">{[
        ['Package (claimed)', result.packageId], ['Version (claimed)', result.version], ['Publisher (claimed)', result.claimedPublisher],
        ['Support (declared)', `${result.claimedPlatforms.join(', ')} · Node ${result.claimedMinNodeMajor}+`],
      ].map(([label, value]) => <div key={label}><dt className="text-slate-400">{label}</dt><dd className="mt-1 break-all">{value}</dd></div>)}</dl>
      <details className="mt-4 text-xs"><summary className="cursor-pointer">Selected-file checksums</summary>
        <dl className="mt-3 space-y-3">{[['Archive SHA-256', result.archiveSha256], ['Manifest-declared archive SHA-256', result.claimedArchiveSha256],
          ['Selected manifest SHA-256', result.manifestSha256]].map(([label, value]) => <div key={label}><dt className="text-slate-400">{label}</dt><dd className="break-all font-mono">{value}</dd></div>)}</dl></details>
      <p className="mt-4 text-sm leading-6 text-slate-300">Checksum comparison only. Archive contents, publisher trust and compatibility have not been checked. Platform admission is not granted.</p>
    </div>}
    <p className="mt-4 text-sm text-slate-400">Community adapter installation is not available here yet. A matching checksum cannot register a capability or grant program access.</p>
  </section>;
}
