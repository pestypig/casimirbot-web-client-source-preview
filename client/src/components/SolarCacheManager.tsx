import React from 'react';
import { Button } from '@/components/ui/button';
type CacheStatus = { bytes: number; maxBytes: number; busy: boolean;
  requests: { id: string; bytes: number; modifiedAt: string }[] };
export function SolarCacheManager() {
  const [cache, setCache] = React.useState<CacheStatus | null>(null);
  const [status, setStatus] = React.useState('');
  const [pending, setPending] = React.useState(false);
  async function refresh() {
    const response = await fetch('/api/star-watcher/cache');
    if (!response.ok) throw new Error('Managed cache unavailable or developer session required');
    setCache(await response.json());
  }
  async function run(action: () => Promise<void>) {
    setPending(true);
    try { await action(); } catch (error) { setStatus(error instanceof Error ? error.message : 'Cache operation failed'); }
    finally { setPending(false); }
  }
  return <section className="space-y-2 rounded border border-slate-700 p-3" aria-label="Solar download cache">
    <h3 className="text-sm font-medium">Managed solar downloads</h3>
    <p className="text-xs text-slate-400">Save observation snapshots before reclaiming downloads. A snapshot retains display data, not the original FITS file. Deletion is permanent; replayed or exported local files are untouched.</p>
    <Button disabled={pending} onClick={() => void run(refresh)}>Inspect / refresh cache</Button>
    {cache && <><p className="text-xs">{(cache.bytes / 1e6).toFixed(1)} / {(cache.maxBytes / 1e6).toFixed(0)} MB retained {cache.busy ? '— download active' : ''}</p>
      <ul className="max-h-48 space-y-2 overflow-auto">{cache.requests.map(request => <li key={request.id} className="text-xs">
        {request.id} — {(request.bytes / 1e6).toFixed(1)} MB — {request.modifiedAt}{' '}
        <Button size="sm" variant="outline" disabled={pending || cache.busy} onClick={() => {
          if (!window.confirm(`Permanently delete managed download ${request.id}? Original FITS files will be lost. Save any required evidence first.`)) return;
          void run(async () => {
            const response = await fetch('/api/star-watcher/cache/reclaim', { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: request.id, confirmation: 'delete-managed-download' }) });
            if (!response.ok) throw new Error('Deletion rejected; refresh the cache and check active downloads');
            setStatus(`Permanently deleted ${request.id}. Saved local snapshots were not changed.`);
            await refresh();
          });
        }}>Delete this download</Button>
      </li>)}</ul></>}
    <p role="status" className="text-xs text-amber-200">{status}</p>
  </section>;
}
