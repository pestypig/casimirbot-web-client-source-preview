import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

export type HelixAskActionCarouselDirection = "left" | "right";

export type HelixAskActionCarouselEdges = {
  canScrollLeft: boolean;
  canScrollRight: boolean;
};

export type HelixAskActionCarouselController = HelixAskActionCarouselEdges & {
  viewportRef: RefObject<HTMLDivElement>;
  trackRef: RefObject<HTMLDivElement>;
  onScrollLeft: () => void;
  onScrollRight: () => void;
};

export type UseHelixAskActionCarouselOptions = {
  onScrollIntent?: (direction: HelixAskActionCarouselDirection) => void;
};

const HELIX_ASK_ACTION_CAROUSEL_EDGE_TOLERANCE_PX = 2;
const HELIX_ASK_ACTION_CAROUSEL_DEFAULT_GAP_PX = 8;
const HELIX_ASK_ACTION_CAROUSEL_MIN_STEP_PX = 48;
const HELIX_ASK_ACTION_CAROUSEL_SETTLE_MS = 320;

const NO_SCROLL_EDGES: HelixAskActionCarouselEdges = {
  canScrollLeft: false,
  canScrollRight: false,
};

function readFiniteCssPixels(value: string | undefined): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function readCarouselSafeInsets(viewport: HTMLDivElement): {
  left: number;
  right: number;
} {
  if (typeof getComputedStyle !== "function") return { left: 0, right: 0 };
  const style = getComputedStyle(viewport);
  return {
    left: readFiniteCssPixels(style.paddingLeft),
    right: readFiniteCssPixels(style.paddingRight),
  };
}

function hasUsableRect(rect: DOMRect): boolean {
  return (
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.right) &&
    rect.right - rect.left > 0
  );
}

/**
 * Reads physical left/right reachability. Real action geometry is preferred
 * over padded track bounds and is stable across browser RTL scrollLeft models.
 */
export function readHelixAskActionCarouselEdges(
  viewport: HTMLDivElement | null,
  track: HTMLDivElement | null,
  tolerancePx = HELIX_ASK_ACTION_CAROUSEL_EDGE_TOLERANCE_PX,
): HelixAskActionCarouselEdges {
  if (!viewport) return NO_SCROLL_EDGES;

  const maxScrollLeft = Math.max(
    0,
    viewport.scrollWidth - viewport.clientWidth,
  );
  if (maxScrollLeft <= tolerancePx) return NO_SCROLL_EDGES;

  if (track) {
    const viewportRect = viewport.getBoundingClientRect();
    const trackRect = track.getBoundingClientRect();
    if (hasUsableRect(viewportRect) && hasUsableRect(trackRect)) {
      const insets = readCarouselSafeInsets(viewport);
      const visibleLeft = viewportRect.left + insets.left;
      const visibleRight = viewportRect.right - insets.right;
      const actionRects = [
        ...track.querySelectorAll<HTMLElement>(
          "[data-helix-ask-action-item='true']",
        ),
      ]
        .map((action) => action.getBoundingClientRect())
        .filter(hasUsableRect);
      if (actionRects.length > 0) {
        const contentLeft = Math.min(...actionRects.map((rect) => rect.left));
        const contentRight = Math.max(...actionRects.map((rect) => rect.right));
        return {
          canScrollLeft: contentLeft < visibleLeft - tolerancePx,
          canScrollRight: contentRight > visibleRight + tolerancePx,
        };
      }
      return {
        canScrollLeft: trackRect.left < visibleLeft - tolerancePx,
        canScrollRight: trackRect.right > visibleRight + tolerancePx,
      };
    }
  }

  const rawScrollLeft = viewport.scrollLeft;
  const direction =
    typeof getComputedStyle === "function"
      ? getComputedStyle(viewport).direction
      : "ltr";
  const scrollFromPhysicalLeft =
    direction === "rtl"
      ? rawScrollLeft < 0
        ? maxScrollLeft + rawScrollLeft
        : rawScrollLeft === 0
          ? maxScrollLeft
          : rawScrollLeft
      : rawScrollLeft;
  const clampedScrollLeft = Math.min(
    maxScrollLeft,
    Math.max(0, scrollFromPhysicalLeft),
  );
  return {
    canScrollLeft: clampedScrollLeft > tolerancePx,
    canScrollRight: clampedScrollLeft < maxScrollLeft - tolerancePx,
  };
}

function clampCollapsedCarousel(viewport: HTMLDivElement): void {
  const maxScrollLeft = Math.max(
    0,
    viewport.scrollWidth - viewport.clientWidth,
  );
  if (
    maxScrollLeft <= HELIX_ASK_ACTION_CAROUSEL_EDGE_TOLERANCE_PX &&
    Math.abs(viewport.scrollLeft) > HELIX_ASK_ACTION_CAROUSEL_EDGE_TOLERANCE_PX
  ) {
    viewport.scrollLeft = 0;
  }
}

function readCarouselStep(
  viewport: HTMLDivElement,
  track: HTMLDivElement | null,
): number {
  const firstAction = track?.querySelector<HTMLElement>(
    "[data-helix-ask-action-item='true']",
  );
  const gap =
    track && typeof getComputedStyle === "function"
      ? readFiniteCssPixels(getComputedStyle(track).columnGap) ||
        HELIX_ASK_ACTION_CAROUSEL_DEFAULT_GAP_PX
      : HELIX_ASK_ACTION_CAROUSEL_DEFAULT_GAP_PX;
  const itemWidth = firstAction?.offsetWidth ?? 0;
  return Math.min(
    Math.max(HELIX_ASK_ACTION_CAROUSEL_MIN_STEP_PX, itemWidth + gap),
    Math.max(HELIX_ASK_ACTION_CAROUSEL_MIN_STEP_PX, viewport.clientWidth),
  );
}

/** Center one neighboring control instead of advancing by an arbitrary width. */
export function readHelixAskActionCarouselScrollDelta(
  viewport: HTMLDivElement,
  track: HTMLDivElement | null,
  direction: HelixAskActionCarouselDirection,
): number {
  const viewportRect = viewport.getBoundingClientRect();
  const actionRects = track
    ? [...track.querySelectorAll<HTMLElement>("[data-helix-ask-action-item='true']")]
      .map(action => action.getBoundingClientRect())
      .filter(hasUsableRect)
    : [];
  if (hasUsableRect(viewportRect) && actionRects.length > 0) {
    const viewportCenter = (viewportRect.left + viewportRect.right) / 2;
    const centers = actionRects.map(rect => (rect.left + rect.right) / 2)
      .sort((left, right) => left - right);
    const targetCenter = direction === "right"
      ? centers.find(center => center > viewportCenter + HELIX_ASK_ACTION_CAROUSEL_EDGE_TOLERANCE_PX)
      : [...centers].reverse().find(center =>
        center < viewportCenter - HELIX_ASK_ACTION_CAROUSEL_EDGE_TOLERANCE_PX);
    if (targetCenter !== undefined) return targetCenter - viewportCenter;
    // A broad final control may already cross center but still be clipped.
    const insets = readCarouselSafeInsets(viewport);
    const overflow = direction === "right"
      ? Math.max(...actionRects.map(rect => rect.right)) - (viewportRect.right - insets.right)
      : Math.min(...actionRects.map(rect => rect.left)) - (viewportRect.left + insets.left);
    if ((direction === "right" && overflow > 0) ||
      (direction === "left" && overflow < 0)) return overflow;
  }
  const fallback = readCarouselStep(viewport, track);
  return direction === "right" ? fallback : -fallback;
}

export function useHelixAskActionCarousel(
  options: UseHelixAskActionCarouselOptions = {},
): HelixAskActionCarouselController {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const [edges, setEdges] =
    useState<HelixAskActionCarouselEdges>(NO_SCROLL_EDGES);

  const refreshEdges = useCallback(() => {
    const viewport = viewportRef.current;
    if (viewport) clampCollapsedCarousel(viewport);
    const next = readHelixAskActionCarouselEdges(viewport, trackRef.current);
    setEdges((current) =>
      current.canScrollLeft === next.canScrollLeft &&
      current.canScrollRight === next.canScrollRight
        ? current
        : next,
    );
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;

    viewport.addEventListener("scroll", refreshEdges, { passive: true });
    window.addEventListener("resize", refreshEdges);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(refreshEdges);
    resizeObserver?.observe(viewport);
    resizeObserver?.observe(track);

    const mutationObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(refreshEdges);
    mutationObserver?.observe(track, { childList: true, subtree: true });
    mutationObserver?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["dir"],
    });

    refreshEdges();
    return () => {
      viewport.removeEventListener("scroll", refreshEdges);
      window.removeEventListener("resize", refreshEdges);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [refreshEdges]);

  useEffect(
    () => () => {
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }
    },
    [],
  );

  const scroll = useCallback(
    (direction: HelixAskActionCarouselDirection) => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      options.onScrollIntent?.(direction);
      const delta = readHelixAskActionCarouselScrollDelta(viewport, trackRef.current, direction);
      viewport.scrollBy({
        left: delta,
        behavior: "smooth",
      });

      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }
      settleTimerRef.current = window.setTimeout(
        refreshEdges,
        HELIX_ASK_ACTION_CAROUSEL_SETTLE_MS,
      );
    },
    [options.onScrollIntent, refreshEdges],
  );

  const onScrollLeft = useCallback(() => scroll("left"), [scroll]);
  const onScrollRight = useCallback(() => scroll("right"), [scroll]);

  return {
    viewportRef,
    trackRef,
    canScrollLeft: edges.canScrollLeft,
    canScrollRight: edges.canScrollRight,
    onScrollLeft,
    onScrollRight,
  };
}
