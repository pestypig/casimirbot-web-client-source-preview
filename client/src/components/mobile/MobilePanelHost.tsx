import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Home, PanelsTopLeft } from "lucide-react";
import { HelixLoadingMark } from "@/components/common/HelixLoadingMark";
import { useTouchToMouseBridge } from "./useTouchToMouseBridge";

type Props = {
  panelId: string;
  title: string;
  loader: () => Promise<{ default: ComponentType<any> }>;
  onHome: () => void;
  onShowSwitcher: () => void;
};

export function MobilePanelHost({ panelId, title, loader, onHome, onShowSwitcher }: Props) {
  const LazyPanel = useMemo(() => lazy(loader), [loader, panelId]);
  const hostRef = useTouchToMouseBridge<HTMLDivElement>();
  const [pinchRestoring, setPinchRestoring] = useState(false);
  const touchPointers = useRef<Set<number>>(new Set());
  const restoreTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      touchPointers.current.add(event.pointerId);
      if (touchPointers.current.size >= 2 && restoreTimer.current) {
        clearTimeout(restoreTimer.current);
        restoreTimer.current = undefined;
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      touchPointers.current.delete(event.pointerId);
      if (touchPointers.current.size < 2) {
        setPinchRestoring(true);
        if (restoreTimer.current) clearTimeout(restoreTimer.current);
        restoreTimer.current = setTimeout(() => {
          setPinchRestoring(false);
          restoreTimer.current = undefined;
        }, 200);
      }
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("pointerleave", onPointerUp);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("pointerleave", onPointerUp);
    };
  }, []);

  return (
    <div
      className="relative h-full min-h-screen w-full max-w-[100vw] overflow-hidden bg-slate-900 text-slate-100"
      style={{ minHeight: "max(100dvh, 100vh)" }}
    >
      <div
        className="flex h-full flex-col"
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)"
        }}
      >
        <div
          className="sticky top-0 z-20 flex items-center gap-2 border-b border-white/10 bg-slate-900/90 px-3 py-2 backdrop-blur sm:px-4 sm:py-3"
          style={{ top: "env(safe-area-inset-top, 0px)" }}
        >
          <button
            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 min-h-[44px] sm:px-3.5 sm:py-1.5"
            onClick={onHome}
          >
            <Home className="h-4 w-4" />
            Home
          </button>
          <div className="flex-1 text-center text-sm font-semibold text-slate-100 line-clamp-1">
            {title}
          </div>
          <button
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-100 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 min-h-[44px] sm:px-3.5 sm:py-1.5"
            onClick={onShowSwitcher}
          >
            <PanelsTopLeft className="h-4 w-4" />
            Switcher
          </button>
        </div>

        <div
          ref={hostRef}
          className={`flex-1 overflow-hidden touch-manipulation transition-transform duration-200 ${
            pinchRestoring ? "scale-100" : ""
          }`}
          style={{
            maxWidth: "100vw",
            touchAction: "manipulation",
            overscrollBehavior: "contain"
          }}
        >
          <div
            className="h-full w-full overflow-y-auto overflow-x-hidden"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <Suspense
              fallback={
                <HelixLoadingMark title="Loading panel" detail={title} compact />
              }
            >
              <LazyPanel />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
