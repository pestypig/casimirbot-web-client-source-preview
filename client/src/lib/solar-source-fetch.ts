// One SunPy export may occupy the server lock for up to 180 seconds. Allow that
// export to finish before declaring a source gap; seeking aborts the wait.
const BUSY_RETRY_DELAYS_MS = [1_000, ...Array(39).fill(5_000)] as readonly number[];

function waitUnlessAborted(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

/** Waits only for the server's single-export lock. Source gaps and capacity failures are final. */
export async function fetchSolarSourceJson(
  url: string,
  signal: AbortSignal,
  options: { fetcher?: typeof fetch; retryDelaysMs?: readonly number[];
    wait?: typeof waitUnlessAborted; onBusy?: (attempt: number) => void } = {},
): Promise<Record<string, unknown>> {
  const fetcher = options.fetcher ?? fetch;
  const delays = options.retryDelaysMs ?? BUSY_RETRY_DELAYS_MS;
  const wait = options.wait ?? waitUnlessAborted;
  for (let attempt = 0; ; attempt++) {
    const response = await fetcher(url, { credentials: 'same-origin', cache: 'no-store', signal });
    const body = await response.json() as Record<string, unknown>;
    if (response.ok) return body;
    const error = String(body.error ?? `HTTP ${response.status}`);
    const detail = typeof body.message === 'string' ? body.message : null;
    if (error === 'solar_export_resource_blocked' && detail === 'SOLAR_EXPORT_BUSY' &&
        attempt < delays.length) {
      options.onBusy?.(attempt + 1);
      await wait(delays[attempt], signal);
      continue;
    }
    throw new Error(detail ? `${error}: ${detail}` : error);
  }
}
