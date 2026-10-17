import { useEffect, useRef } from "react";
import { normalizeHash } from "./hashes";

type Options = {
  rootMargin?: string;
  thresholds?: number[];
};

function resolveHashFromNode(node: Element): string {
  const raw = node.getAttribute("data-panel-hash") ?? "";
  if (!raw) return "";
  return normalizeHash(raw);
}

export const SUPPRESS_HASH_SCROLL_KEY = "__helixSuppressHashScroll";

function replaceHash(hash: string) {
  if (typeof window === "undefined") return;

  const canonical = normalizeHash(hash);
  if (!canonical) return;
  if (window.location.hash === canonical) {
    return;
  }

  const { pathname, search, origin } = window.location;
  const oldURL = `${origin}${pathname}${search}${window.location.hash}`;
  const newURL = `${origin}${pathname}${search}${canonical}`;
  const currentX = window.scrollX;
  const currentY = window.scrollY;

  (window as any)[SUPPRESS_HASH_SCROLL_KEY] = true;
  history.replaceState(null, "", `${pathname}${search}${canonical}`);

  // Preserve the user's scroll position; browsers often try to auto-scroll to
  // the new anchor when the hash changes, but we only want that behavior for
  // explicit user-triggered navigation (not passive scroll syncing).
  window.requestAnimationFrame(() => {
    window.scrollTo(currentX, currentY);
    (window as any)[SUPPRESS_HASH_SCROLL_KEY] = false;
  });

  try {
    const event =
      typeof HashChangeEvent === "function"
        ? new HashChangeEvent("hashchange", { oldURL, newURL })
        : new Event("hashchange");
    window.dispatchEvent(event);
  } catch {
    window.dispatchEvent(new Event("hashchange"));
  }
}

/**
 * Watches the page scroll position and keeps window.location.hash aligned with
 * the most prominent `[data-panel-hash]` section currently in view.
 */
export function useScrollHashSync({ rootMargin = "-35% 0px -45% 0px", thresholds = [0, 0.25, 0.5, 0.75, 1] }: Options = {}) {
  const activeHashRef = useRef<string>("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const ratios = new Map<Element, number>();
    const seen = new WeakSet<Element>();

    const pickTop = () => {
      if (!ratios.size) {
        return;
      }
      const [topNode] =
        Array.from(ratios.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([node]) => node);
      if (!topNode) return;
      const nextHash = resolveHashFromNode(topNode);
      if (!nextHash || nextHash === activeHashRef.current) return;
      activeHashRef.current = nextHash;
      replaceHash(nextHash);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        let changed = false;
        for (const entry of entries) {
          const node = entry.target;
          const hash = resolveHashFromNode(node);
          if (!hash) continue;

          if (entry.isIntersecting) {
            ratios.set(node, entry.intersectionRatio);
          } else {
            ratios.delete(node);
          }
          changed = true;
        }
        if (changed) {
          pickTop();
        }
      },
      { root: null, rootMargin, threshold: thresholds },
    );

    const observeNodes = () => {
      document.querySelectorAll<HTMLElement>("[data-panel-hash]").forEach((node) => {
        if (!seen.has(node)) {
          seen.add(node);
          observer.observe(node);
        }
      });
    };

    observeNodes();

    const mutationObserver = new MutationObserver(() => {
      observeNodes();
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutationObserver.disconnect();
      observer.disconnect();
      ratios.clear();
      if (typeof window !== "undefined") {
        (window as any)[SUPPRESS_HASH_SCROLL_KEY] = false;
      }
    };
  }, [rootMargin, thresholds]);
}
