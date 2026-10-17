// @vitest-environment jsdom
import React, { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRoot, Root } from 'react-dom/client';
import { SolarCacheManager } from './SolarCacheManager';
let container: HTMLDivElement;
let root: Root;
const cache = { bytes: 100, maxBytes: 512000000, busy: false,
  requests: [{ id: 'request-abc123', bytes: 100, modifiedAt: '2026-09-26T00:00:00Z' }] };
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => cache }));
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function click(label: string) {
  const button = [...container.querySelectorAll('button')].find(button => button.textContent === label)!;
  await act(async () => { button.click(); });
}
it('requires confirmation before issuing a targeted deletion', async () => {
  await act(async () => { root.render(<SolarCacheManager />); });
  await click('Inspect / refresh cache');
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await click('Delete this download');
  expect(fetch).toHaveBeenCalledTimes(1);
  confirm.mockReturnValue(true);
  await click('Delete this download');
  expect(fetch).toHaveBeenCalledWith('/api/star-watcher/cache/reclaim', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ id: 'request-abc123', confirmation: 'delete-managed-download' }),
  }));
  expect(container.textContent).toContain('Saved local snapshots were not changed');
});
it('disables deletion when the cache reports an active download', async () => {
  vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ ...cache, busy: true }) } as Response);
  await act(async () => { root.render(<SolarCacheManager />); }); await click('Inspect / refresh cache');
  const button = [...container.querySelectorAll('button')].find(button => button.textContent === 'Delete this download')!;
  expect(button.disabled).toBe(true);
});
