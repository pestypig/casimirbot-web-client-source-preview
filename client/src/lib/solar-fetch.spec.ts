import { afterEach, expect, it, vi } from 'vitest';
import { fetchSolarWithTimeout } from './solar-fetch';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
function stalledFetch() {
  vi.stubGlobal('fetch', vi.fn((_input, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  })));
}
it('honors operator cancellation distinctly from timeout', async () => {
  stalledFetch(); const controller = new AbortController();
  const promise = fetchSolarWithTimeout('/solar', { signal: controller.signal }, 60000);
  const rejection = expect(promise).rejects.toMatchObject({ name: 'AbortError', message: 'Solar request cancelled' });
  controller.abort(); await rejection;
});
it('honors operator cancellation when AbortSignal.any is unavailable', async () => {
  vi.stubGlobal('AbortSignal', { any: undefined });
  stalledFetch(); const controller = new AbortController();
  const promise = fetchSolarWithTimeout('/solar', { signal: controller.signal }, 60000);
  const rejection = expect(promise).rejects.toMatchObject({ name: 'AbortError', message: 'Solar request cancelled' });
  controller.abort(); await rejection;
});
it('does not fetch an already cancelled request', async () => {
  stalledFetch(); const controller = new AbortController(); controller.abort();
  await expect(fetchSolarWithTimeout('/solar', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetch).not.toHaveBeenCalled();
});
it('retains a bounded request timeout', async () => {
  vi.useFakeTimers(); stalledFetch();
  const rejected = expect(fetchSolarWithTimeout('/solar', {}, 50)).rejects.toThrow('after 50 ms');
  await vi.advanceTimersByTimeAsync(50); await rejected;
  expect(vi.getTimerCount()).toBe(0);
});
it('retains the timeout with a caller signal on runtimes without AbortSignal.any', async () => {
  vi.stubGlobal('AbortSignal', { any: undefined });
  vi.useFakeTimers(); stalledFetch();
  const caller = new AbortController();
  const rejected = expect(fetchSolarWithTimeout('/solar', { signal: caller.signal }, 50)).rejects.toThrow('after 50 ms');
  await vi.advanceTimersByTimeAsync(50); await rejected;
  expect(caller.signal.aborted).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
