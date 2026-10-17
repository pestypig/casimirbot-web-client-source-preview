import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  HELIX_WORKSTATION_GUIDANCE_EVENT,
  coerceWorkstationGuidanceRequest,
  type WorkstationGuidanceRequest,
} from "@/lib/workstation/workstationGuidance";

type GuidanceView = Readonly<{
  request: WorkstationGuidanceRequest;
  rect: DOMRect;
  integrationBlocked: boolean;
}>;

const findGuidanceTarget = (
  request: WorkstationGuidanceRequest,
): HTMLElement | null => {
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>(
      "[data-helix-guidance-target], [data-helix-control-id], [data-workstation-panel-id]",
    ),
  );
  const findUnmetTarget = (
    targetId: string,
    visited = new Set<string>(),
  ): HTMLElement | null => {
    if (visited.has(targetId)) return null;
    visited.add(targetId);
    const exact = elements.find(
      (element) => element.dataset.helixGuidanceTarget === targetId,
    );
    if (!exact) return null;
    if (exact.dataset.helixGuidanceSatisfied !== "true") return exact;
    const nextTargetIds = [
      ...(exact.dataset.helixGuidanceNextTargets?.split(/\s+/) ?? []),
      exact.dataset.helixGuidanceNextTarget,
    ].filter((value): value is string => Boolean(value));
    for (const nextTargetId of nextTargetIds) {
      const next = findUnmetTarget(nextTargetId, visited);
      if (next) return next;
    }
    return null;
  };
  if (request.targetId) {
    const exact = findUnmetTarget(request.targetId);
    if (exact) return exact;
  }
  if (request.controlId) {
    const exact = elements.find((element) => {
      const id = element.dataset.helixControlId;
      return id === request.controlId || id?.endsWith(`.${request.controlId}`);
    });
    if (exact) return exact;
  }
  // Human attention must identify one concrete control. A missing or stale
  // control id must not degrade into a spotlight over the entire panel, which
  // can make the wrong next action look current. General tool activity may
  // still use the panel as its presentation target.
  if (request.kind === "tool_activity" && request.panelId) {
    return (
      elements.find(
        (element) => element.dataset.workstationPanelId === request.panelId,
      ) ?? null
    );
  }
  return null;
};

export default function WorkstationGuidanceOverlay() {
  const [view, setView] = useState<GuidanceView | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const clearActive = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setView(null);
  }, []);

  useEffect(() => {
    const handleGuidance = (event: Event) => {
      const request = coerceWorkstationGuidanceRequest(
        (event as CustomEvent<unknown>).detail,
      );
      if (!request) return;
      clearActive();
      if (request.panelId) {
        window.dispatchEvent(
          new CustomEvent("open-helix-panel", {
            detail: { id: request.panelId },
          }),
        );
      }

      let attempts = 0;
      let retryId: number | null = null;
      let dismissId: number | null = null;
      let trackingFrameId: number | null = null;
      let target: HTMLElement | null = null;
      let observer: MutationObserver | null = null;
      const updateRect = () => {
        if (!target) return;
        const guidanceContext = target.closest<HTMLElement>("[data-helix-guidance-label]") ?? target;
        const targetLabel = guidanceContext.dataset.helixGuidanceLabel;
        setView({
          request: targetLabel ? { ...request, label: targetLabel } : request,
          rect: target.getBoundingClientRect(),
          integrationBlocked: guidanceContext.dataset.helixGuidanceIntegrationBlocked === "true",
        });
      };
      const resolve = () => {
        attempts += 1;
        const nextTarget = findGuidanceTarget(request);
        if (!nextTarget) {
          // Never leave an obsolete spotlight over a prerequisite that became
          // satisfied while the next wizard control is still mounting. The
          // retry remains active and will present the next unmet step once it
          // exists, but the old control is immediately usable without a
          // misleading "action required" label.
          target = null;
          setView(null);
          if (attempts < 40) retryId = window.setTimeout(resolve, 50);
          return;
        }
        if (target === nextTarget) {
          updateRect();
          return;
        }
        target = nextTarget;
        // The panel host has its own scroll container. Smooth scrolling can
        // move the target after the first rectangle is sampled without
        // producing a window scroll event, leaving the outline over an
        // unrelated control. Scroll deterministically and track geometry for
        // the lifetime of the guide so nested scroll/layout changes cannot
        // detach the spotlight from its exact element.
        target.scrollIntoView({
          behavior: "auto",
          block: "center",
          inline: "nearest",
        });
        updateRect();
        if (trackingFrameId === null) {
          const track = () => {
            updateRect();
            trackingFrameId = window.requestAnimationFrame(track);
          };
          trackingFrameId = window.requestAnimationFrame(track);
        }
        if (dismissId === null) {
          dismissId = window.setTimeout(
            clearActive,
            request.durationMs ?? 5200,
          );
        }
        window.addEventListener("resize", updateRect, { passive: true });
        window.addEventListener("scroll", updateRect, {
          passive: true,
          capture: true,
        });
      };
      cleanupRef.current = () => {
        if (retryId !== null) window.clearTimeout(retryId);
        if (dismissId !== null) window.clearTimeout(dismissId);
        if (trackingFrameId !== null) {
          window.cancelAnimationFrame(trackingFrameId);
        }
        observer?.disconnect();
        window.removeEventListener("resize", updateRect);
        window.removeEventListener("scroll", updateRect, true);
      };
      observer = new MutationObserver(resolve);
      observer.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
      });
      resolve();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearActive();
    };
    window.addEventListener(HELIX_WORKSTATION_GUIDANCE_EVENT, handleGuidance);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener(
        HELIX_WORKSTATION_GUIDANCE_EVENT,
        handleGuidance,
      );
      window.removeEventListener("keydown", handleEscape);
      clearActive();
    };
  }, [clearActive]);

  if (!view) return null;
  const { rect } = view;
  const isAttention = view.request.kind === "user_attention";
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[10000]"
      data-testid="workstation-guidance-overlay"
    >
      <button
        type="button"
        onClick={clearActive}
        className="pointer-events-auto fixed right-4 top-4 z-[10001] rounded-lg border border-white/30 bg-slate-950/95 px-3 py-2 text-xs font-semibold text-white shadow-xl hover:bg-slate-900"
        aria-label="Dismiss guidance"
      >
        Close guide
      </button>
      <div
        data-testid="workstation-guidance-spotlight"
        className={`absolute rounded-lg border-2 ${isAttention ? "border-amber-200" : "border-cyan-200"}`}
        style={{
          left: Math.max(4, rect.left - 7),
          top: Math.max(4, rect.top - 7),
          width: Math.max(16, rect.width + 14),
          height: Math.max(16, rect.height + 14),
          boxShadow: `0 0 0 9999px rgba(2,6,23,0.68), 0 0 28px ${isAttention ? "rgba(251,191,36,0.55)" : "rgba(34,211,238,0.48)"}`,
        }}
      />
      <div
        className={`pointer-events-auto absolute max-w-xs rounded-lg border px-3 py-2 text-xs font-semibold shadow-xl ${isAttention ? "border-amber-200/60 bg-amber-950/95 text-amber-50" : "border-cyan-200/60 bg-cyan-950/95 text-cyan-50"}`}
        style={{
          left: Math.max(8, Math.min(window.innerWidth - 328, rect.left)),
          top: Math.max(8, rect.top > 74 ? rect.top - 58 : rect.bottom + 12),
        }}
        role="status"
        aria-live="polite"
      >
        <span className="block pr-1">
          {view.integrationBlocked
            ? "Connection limitation: "
            : isAttention
            ? "Your action is required: "
            : "Agent activity (view only): "}
          {view.request.label}
        </span>
      </div>
    </div>
  );
}
