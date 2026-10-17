/** Preserve operator cancellation independently of the request timeout. */
export function fetchSolarWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 120_000) {
  const controller = new AbortController();
  const caller = init.signal;
  if (caller?.aborted) return Promise.reject(new DOMException('Solar request cancelled', 'AbortError'));
  const combined = caller && typeof AbortSignal.any !== 'function' ? new AbortController() : null;
  const cancelFromCaller = () => combined?.abort(caller?.reason);
  const cancelFromTimeout = () => combined?.abort(controller.signal.reason);
  if (combined && caller) {
    caller.addEventListener('abort', cancelFromCaller, { once: true });
    controller.signal.addEventListener('abort', cancelFromTimeout, { once: true });
  }
  const signal = caller ? combined?.signal ?? AbortSignal.any([caller, controller.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  return fetch(input, { ...init, signal }).catch(error => {
    if (caller?.aborted) throw new DOMException('Solar request cancelled', 'AbortError');
    if (controller.signal.aborted) throw new Error(`request aborted after ${timeoutMs} ms`);
    throw error;
  }).finally(() => {
    clearTimeout(timer);
    caller?.removeEventListener('abort', cancelFromCaller);
    controller.signal.removeEventListener('abort', cancelFromTimeout);
  });
}
