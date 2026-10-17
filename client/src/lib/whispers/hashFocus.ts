import { normalizeHash } from "./hashes";

type Cleanup = () => void;

/**
 * Attaches canonical hash focus behavior to a DOM element.
 * Pointer/focus events keep window.location.hash aligned with the element's
 * canonical whisper hash.
 */
export function attachHashFocus(el: HTMLElement, hash: string): Cleanup {
  const canonical = normalizeHash(hash);
  if (!canonical) {
    return () => undefined;
  }

  el.setAttribute("data-panel-hash", canonical);

  const setHash = () => {
    if (typeof window === "undefined") return;
    if (window.location.hash === canonical) return;
    window.location.hash = canonical;
  };

  el.addEventListener("pointerenter", setHash);
  el.addEventListener("focus", setHash, true);
  el.addEventListener("click", setHash);

  return () => {
    el.removeEventListener("pointerenter", setHash);
    el.removeEventListener("focus", setHash, true);
    el.removeEventListener("click", setHash);
  };
}
