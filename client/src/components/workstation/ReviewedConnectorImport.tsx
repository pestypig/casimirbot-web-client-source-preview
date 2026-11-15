import React, { useEffect, useRef, useState } from 'react';
import { reviewedConnectorImportStateSchema, type ReviewedConnectorImportState } from '@shared/reviewed-connector-import';
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from '@/lib/workstation/accountCapabilityPolicy';

export type ReviewedConnectorImportBridge = { inspect: () => Promise<unknown>; import: () => Promise<unknown>;
  remove: () => Promise<unknown>; invalidate: () => Promise<unknown> };
const failure = (code?: string) => code === 'package_archive_hash_mismatch'
  ? 'That archive does not match the fixed native review. No candidate manifest can approve a different package.'
  : code === 'reviewed_import_account_required' ? 'Sign in to the native account, then refresh.'
  : code === 'reviewed_import_identity_changed' || code === 'reviewed_import_cancelled'
    ? 'Account, device or native page changed. Refresh before another operation.'
    : 'Native import is unavailable or was not confirmed. Refresh to inspect the current stored state.';

export default function ReviewedConnectorImport({ bridge }: { bridge: ReviewedConnectorImportBridge | null }) {
  const [state, setState] = useState<ReviewedConnectorImportState | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const seen = useRef(false), mounted = useRef(false), pending = useRef(false), generation = useRef(0);
  const mutationPending = useRef(false);
  const activeBridge = useRef<ReviewedConnectorImportBridge | null>(null);
  const call = async (operation: 'inspect' | 'import' | 'remove') => {
    const selectedBridge = activeBridge.current;
    if (!selectedBridge || pending.current) return;
    const current = ++generation.current;
    pending.current = true; mutationPending.current = operation !== 'inspect'; setBusy(true); setMessage('');
    try {
      const next = reviewedConnectorImportStateSchema.parse(await selectedBridge[operation]());
      if (!mounted.current || current !== generation.current) return;
      if (next.installAvailable || next.removeAvailable || next.status !== 'unavailable') seen.current = true;
      setState(next);
      setMessage(next.cancelled ? 'Native operation cancelled.' : next.status === 'unavailable' ? failure(next.error)
        : next.status === 'removed' ? (next.codeFilesRemoved
          ? 'Reviewed starter removed. Your data and history were kept.'
          : 'Starter deselected. Changed or locked code was retained; your data and history were kept.')
          : next.status === 'installed_stopped' ? 'Stored for this account and device. Not connected; no runtime or program grant.' : '');
    } catch {
      if (mounted.current && current === generation.current) { setState(null); setMessage(failure()); }
    } finally {
      pending.current = false; mutationPending.current = false;
      if (mounted.current) {
        setBusy(false);
        if (current !== generation.current) void call('inspect');
      }
    }
  };
  useEffect(() => {
    mounted.current = true; activeBridge.current = bridge;
    seen.current = false; setState(null); setMessage('');
    void call('inspect');
    const changed = () => {
      generation.current++; seen.current = false; setState(null); setMessage('');
      void bridge?.invalidate().catch(() => {}).finally(() => { if (!pending.current && mounted.current) void call('inspect'); });
    };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, changed);
    return () => {
      mounted.current = false; generation.current++;
      activeBridge.current = null;
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, changed);
      if (pending.current && mutationPending.current) void bridge?.invalidate().catch(() => {});
    };
  }, [bridge]);
  useEffect(() => {
    if (!state?.installAvailable) return;
    const timer = setTimeout(() => {
      setState(current => current ? { ...current, installAvailable: false } : current);
      setMessage('The fixed review expired. Existing stored code can still be removed.');
    }, Math.max(0, Math.min(2147483647, Date.parse(state.reviewExpiresAt) - Date.now())));
    return () => clearTimeout(timer);
  }, [state?.reviewExpiresAt, state?.installAvailable]);
  if (!bridge || !seen.current) return null;
  const button = 'rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300';
  return <section aria-label="Reviewed local starter import" className="mb-6 rounded-2xl border border-amber-300/25 bg-slate-900/70 p-5">
    <h2 className="text-lg font-semibold">Reviewed local starter · private import prototype</h2>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">A separate native picker accepts one fixed reviewed archive and asks for confirmation. Import keeps it stopped. This is not general community-adapter admission.</p>
    {state && <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">{[
      ['Package', `${state.packageId} ${state.version}`], ['Storage', state.status.replaceAll('_', ' ')],
      ['Expected reviewed archive SHA-256', state.artifactSha256], ['Review expires', new Date(state.reviewExpiresAt).toLocaleString()],
    ].map(([label, value]) => <div key={label}><dt className="text-slate-400">{label}</dt><dd className="mt-1 break-all">{value}</dd></div>)}</dl>}
    <div className="mt-4 flex flex-wrap gap-3">
      <button type="button" className={button} disabled={busy || !state?.installAvailable} onClick={() => void call('import')}>Import reviewed starter</button>
      <button type="button" className={button} disabled={busy || !state?.removeAvailable} onClick={() => void call('remove')}>Remove stored starter</button>
      <button type="button" className={button} disabled={busy} onClick={() => void call('inspect')}>Refresh reviewed import</button>
    </div>
    <p role="status" aria-live="polite" className="mt-3 text-sm text-cyan-100">{busy ? 'Waiting for native review or storage inspection…' : message}</p>
    <p className="mt-3 text-sm text-slate-400">No connection, capability registration, program grant or execution is enabled by this import.</p>
  </section>;
}
