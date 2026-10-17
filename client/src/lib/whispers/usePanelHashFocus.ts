import { useEffect, useRef } from "react";
import { publishPanelContext } from "./contextRegistry";
import { attachHashFocus } from "./hashFocus";
import { normalizeHash } from "./hashes";
import type { WhisperPanelContext } from "./contextRegistry";
import { recordActivitySample } from "@/lib/essence/activityReporter";

type PanelContextFactory = () => WhisperPanelContext | null | undefined;

/**
 * Focus helper that aligns pointer/focus navigation with canonical hashes and
 * pushes an up-to-date panel context snapshot for whisper scoring.
 */
export function usePanelHashFocus(
  hash: string,
  getPanelContext?: PanelContextFactory,
) {
  const ref = useRef<HTMLElement | null>(null);
  const contextFactoryRef = useRef<PanelContextFactory | undefined>(getPanelContext);
  contextFactoryRef.current = getPanelContext;

  useEffect(() => {
    const canonical = normalizeHash(hash);
    const el = ref.current;
    if (!el || !canonical) return;
    const tag = canonical.replace(/^#/, "");

    const detachHash = attachHashFocus(el, canonical);

    const pushContext = () => {
      const factory = contextFactoryRef.current;
      if (!factory) return;
      try {
        const snapshot = factory();
        publishPanelContext(canonical, snapshot ?? undefined);
      } catch (err) {
        console.warn("[luma-whispers] failed to build panel context", err);
      }
    };

    const onEnter = () => {
      pushContext();
      if (tag) {
        recordActivitySample({
          panelId: `hash:${tag}`,
          tag,
          meta: { hash: canonical, source: "panel-hash" },
        });
      }
    };

    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("focusin", onEnter);

    return () => {
      detachHash();
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("focusin", onEnter);
    };
  }, [hash]);

  return ref;
}
