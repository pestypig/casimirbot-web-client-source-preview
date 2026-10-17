/**
 * @vitest-environment jsdom
 */
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HelixAskActionToolbar,
  type HelixAskActionToolbarProps,
} from "../HelixAskActionToolbar";
import {
  readHelixAskActionCarouselEdges,
  readHelixAskActionCarouselScrollDelta,
  useHelixAskActionCarousel,
  type HelixAskActionCarouselDirection,
} from "../useHelixAskActionCarousel";

type CarouselMetrics = {
  clientWidth: number;
  scrollWidth: number;
  scrollLeft: number;
};

const resizeObservers: ResizeObserverMock[] = [];

class ResizeObserverMock implements ResizeObserver {
  readonly targets = new Set<Element>();

  constructor(private readonly callback: ResizeObserverCallback) {
    resizeObservers.push(this);
  }

  observe(target: Element) {
    this.targets.add(target);
  }

  unobserve(target: Element) {
    this.targets.delete(target);
  }

  disconnect() {
    this.targets.clear();
  }

  trigger(targets: Element[] = [...this.targets]) {
    this.callback(
      targets.map((target) => ({ target }) as ResizeObserverEntry),
      this,
    );
  }
}

function buildProps(
  overrides: Partial<HelixAskActionToolbarProps> = {},
): HelixAskActionToolbarProps {
  return {
    canScrollLeft: false,
    canScrollRight: false,
    onScrollLeft: vi.fn(),
    onScrollRight: vi.fn(),
    onImageSelect: vi.fn(),
    onAttachImage: vi.fn(),
    micEnabled: false,
    showMicButton: false,
    onToggleMic: vi.fn(),
    onRetryVoiceSample: vi.fn(),
    showVisualCaptureControls: false,
    visualSituationSourceStatus: "idle",
    onCaptureVisualSource: vi.fn(),
    visualSituationIncludeAudio: false,
    onToggleVisualAudio: vi.fn(),
    runtimePicker: <button type="button">Runtime</button>,
    submitButton: <button type="button">Submit</button>,
    ...overrides,
  };
}

function CarouselHarness({
  delayedControl = false,
  onScrollIntent,
}: {
  delayedControl?: boolean;
  onScrollIntent?: (direction: HelixAskActionCarouselDirection) => void;
}) {
  const carousel = useHelixAskActionCarousel({ onScrollIntent });
  return (
    <HelixAskActionToolbar
      {...buildProps({
        carouselRef: carousel.viewportRef,
        carouselTrackRef: carousel.trackRef,
        canScrollLeft: carousel.canScrollLeft,
        canScrollRight: carousel.canScrollRight,
        onScrollLeft: carousel.onScrollLeft,
        onScrollRight: carousel.onScrollRight,
        liveRuntimeControls: delayedControl ? (
          <button type="button">Delayed control</button>
        ) : null,
      })}
    />
  );
}

function installCarouselMetrics(
  viewport: HTMLDivElement,
  metrics: CarouselMetrics,
) {
  Object.defineProperties(viewport, {
    clientWidth: {
      configurable: true,
      get: () => metrics.clientWidth,
    },
    scrollWidth: {
      configurable: true,
      get: () => metrics.scrollWidth,
    },
    scrollLeft: {
      configurable: true,
      get: () => metrics.scrollLeft,
      set: (value: number) => {
        metrics.scrollLeft = value;
      },
    },
  });
  const scrollBy = vi.fn((options: ScrollToOptions) => {
    const delta = typeof options.left === "number" ? options.left : 0;
    const maxScrollLeft = Math.max(
      0,
      metrics.scrollWidth - metrics.clientWidth,
    );
    metrics.scrollLeft = Math.min(
      maxScrollLeft,
      Math.max(0, metrics.scrollLeft + delta),
    );
    fireEvent.scroll(viewport);
  });
  Object.defineProperty(viewport, "scrollBy", {
    configurable: true,
    value: scrollBy,
  });
  return scrollBy;
}

function rect(left: number, right: number): DOMRect {
  return {
    x: left,
    y: 0,
    left,
    right,
    top: 0,
    bottom: 40,
    width: right - left,
    height: 40,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("HelixAsk action carousel", () => {
  beforeEach(() => {
    resizeObservers.length = 0;
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps end alignment on an inner track without placing it on the scroll viewport", () => {
    render(<HelixAskActionToolbar {...buildProps({ canScrollRight: true })} />);

    const viewport = screen.getByTestId("helix-ask-action-carousel-viewport");
    const track = screen.getByTestId("helix-ask-action-carousel-track");
    expect(viewport).toHaveClass("overflow-x-auto", "w-full", "min-w-0");
    expect(viewport).not.toHaveClass("snap-mandatory");
    expect(viewport).not.toHaveClass("justify-end");
    expect(track).toHaveClass(
      "flex",
      "w-max",
      "min-w-full",
      "justify-end",
      "px-12",
    );
    expect(
      screen
        .getByRole("button", { name: "Scroll Ask controls right" })
        .querySelector("svg.lucide-chevron-right"),
    ).not.toBeNull();
  });

  it("updates both edges and scrolls by a reachable positive-range action step", async () => {
    const onScrollIntent = vi.fn();
    render(<CarouselHarness onScrollIntent={onScrollIntent} />);
    const viewport = screen.getByTestId(
      "helix-ask-action-carousel-viewport",
    ) as HTMLDivElement;
    const track = screen.getByTestId("helix-ask-action-carousel-track");
    const metrics: CarouselMetrics = {
      clientWidth: 300,
      scrollWidth: 800,
      scrollLeft: 0,
    };
    const scrollBy = installCarouselMetrics(viewport, metrics);
    const observer = resizeObservers.find(
      (candidate) =>
        candidate.targets.has(viewport) && candidate.targets.has(track),
    );
    expect(observer).toBeDefined();

    act(() => observer?.trigger([viewport, track]));
    const left = screen.getByRole("button", {
      name: "Scroll Ask controls left",
    });
    const right = screen.getByRole("button", {
      name: "Scroll Ask controls right",
    });
    await waitFor(() => expect(right).toBeEnabled());
    expect(left).toBeDisabled();

    fireEvent.click(right);
    expect(onScrollIntent).toHaveBeenCalledWith("right");
    expect(scrollBy).toHaveBeenCalledWith({ left: 48, behavior: "smooth" });
    await waitFor(() => expect(left).toBeEnabled());

    metrics.scrollLeft = 500;
    fireEvent.scroll(viewport);
    await waitFor(() => expect(right).toBeDisabled());
    expect(left).toBeEnabled();
  });

  it("centers one neighboring action per arrow press even when control widths differ", () => {
    const viewport = document.createElement("div");
    const track = document.createElement("div");
    viewport.getBoundingClientRect = () => rect(0, 300);
    const centers = [80, 170, 260, 360];
    let offset = 0;
    for (const [index, center] of centers.entries()) {
      const action = document.createElement("button");
      action.dataset.helixAskActionItem = "true";
      const width = index % 2 ? 80 : 120;
      action.getBoundingClientRect = () => rect(center - width / 2 - offset,
        center + width / 2 - offset);
      track.append(action);
    }
    const firstMove = readHelixAskActionCarouselScrollDelta(viewport, track, "right");
    expect(firstMove).toBe(20);
    offset += firstMove;
    const secondMove = readHelixAskActionCarouselScrollDelta(viewport, track, "right");
    expect(secondMove).toBe(90);
    offset += secondMove;
    expect(readHelixAskActionCarouselScrollDelta(viewport, track, "left")).toBe(-90);
  });

  it("remeasures delayed track content and clears stale scroll when overflow collapses", async () => {
    const { rerender } = render(<CarouselHarness />);
    const viewport = screen.getByTestId(
      "helix-ask-action-carousel-viewport",
    ) as HTMLDivElement;
    const track = screen.getByTestId("helix-ask-action-carousel-track");
    const metrics: CarouselMetrics = {
      clientWidth: 300,
      scrollWidth: 300,
      scrollLeft: 0,
    };
    installCarouselMetrics(viewport, metrics);
    const observer = resizeObservers.find((candidate) =>
      candidate.targets.has(track),
    );
    expect(observer).toBeDefined();

    act(() => observer?.trigger([track]));
    const left = screen.getByRole("button", {
      name: "Scroll Ask controls left",
    });
    const right = screen.getByRole("button", {
      name: "Scroll Ask controls right",
    });
    expect(left).toBeDisabled();
    expect(right).toBeDisabled();

    metrics.scrollWidth = 800;
    rerender(<CarouselHarness delayedControl />);
    act(() => observer?.trigger([track]));
    await waitFor(() => expect(right).toBeEnabled());

    metrics.scrollLeft = 500;
    metrics.scrollWidth = 300;
    act(() => observer?.trigger([track]));
    await waitFor(() => {
      expect(metrics.scrollLeft).toBe(0);
      expect(left).toBeDisabled();
      expect(right).toBeDisabled();
    });
  });

  it("uses physical track geometry for RTL edge detection", () => {
    const viewport = document.createElement("div");
    const track = document.createElement("div");
    viewport.style.direction = "rtl";
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 300 },
      scrollWidth: { configurable: true, value: 800 },
    });
    viewport.getBoundingClientRect = () => rect(0, 300);

    track.getBoundingClientRect = () => rect(-500, 300);
    expect(readHelixAskActionCarouselEdges(viewport, track)).toEqual({
      canScrollLeft: true,
      canScrollRight: false,
    });

    track.getBoundingClientRect = () => rect(-250, 550);
    expect(readHelixAskActionCarouselEdges(viewport, track)).toEqual({
      canScrollLeft: true,
      canScrollRight: true,
    });

    track.getBoundingClientRect = () => rect(0, 800);
    expect(readHelixAskActionCarouselEdges(viewport, track)).toEqual({
      canScrollLeft: false,
      canScrollRight: true,
    });
  });

  it("ignores snapped-off decorative padding when real actions are reachable", () => {
    const viewport = document.createElement("div");
    const track = document.createElement("div");
    const firstAction = document.createElement("button");
    const lastAction = document.createElement("button");
    firstAction.dataset.helixAskActionItem = "true";
    lastAction.dataset.helixAskActionItem = "true";
    track.append(firstAction, lastAction);
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 162 },
      scrollWidth: { configurable: true, value: 808 },
    });
    viewport.getBoundingClientRect = () => rect(0, 162);
    track.getBoundingClientRect = () => rect(-23, 785);
    firstAction.getBoundingClientRect = () => rect(25, 150);
    lastAction.getBoundingClientRect = () => rect(700, 780);

    expect(readHelixAskActionCarouselEdges(viewport, track)).toEqual({
      canScrollLeft: false,
      canScrollRight: true,
    });

    firstAction.getBoundingClientRect = () => rect(-5, 120);
    expect(readHelixAskActionCarouselEdges(viewport, track)).toEqual({
      canScrollLeft: true,
      canScrollRight: true,
    });
  });

  it("remeasures physical edges when the interface direction changes", async () => {
    render(<CarouselHarness />);
    const viewport = screen.getByTestId(
      "helix-ask-action-carousel-viewport",
    ) as HTMLDivElement;
    const track = screen.getByTestId(
      "helix-ask-action-carousel-track",
    ) as HTMLDivElement;
    const metrics: CarouselMetrics = {
      clientWidth: 300,
      scrollWidth: 800,
      scrollLeft: 0,
    };
    installCarouselMetrics(viewport, metrics);
    viewport.getBoundingClientRect = () => rect(0, 300);
    let trackBounds = rect(0, 800);
    track.getBoundingClientRect = () => trackBounds;

    const observer = resizeObservers.find(
      (candidate) =>
        candidate.targets.has(viewport) && candidate.targets.has(track),
    );
    act(() => observer?.trigger([viewport, track]));

    const left = screen.getByRole("button", {
      name: "Scroll Ask controls left",
    });
    const right = screen.getByRole("button", {
      name: "Scroll Ask controls right",
    });
    await waitFor(() => expect(right).toBeEnabled());
    expect(left).toBeDisabled();

    trackBounds = rect(-500, 300);
    document.documentElement.dir = "rtl";
    await waitFor(() => {
      expect(left).toBeEnabled();
      expect(right).toBeDisabled();
    });
    document.documentElement.removeAttribute("dir");
  });
});
