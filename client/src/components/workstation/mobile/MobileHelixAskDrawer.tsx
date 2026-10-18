import { useMemo, useRef } from "react";
import { MessageCircle } from "lucide-react";
import type { PanelDefinition } from "@/lib/desktop/panelRegistry";
import { HelixAskConsole } from "@/components/helix/ask-console/HelixAskConsole";
import { HELIX_ASK_CONTEXT_ID } from "@/lib/helix/voice-surface-contract";
import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";

const SNAP_HEIGHT: Record<"peek" | "half" | "full", string> = {
  peek: "20dvh",
  half: "48dvh",
  full: "82dvh",
};

export function MobileHelixAskDrawer({
  onOpenPanel,
  onOpenConversation,
}: {
  onOpenPanel: (panelId: PanelDefinition["id"]) => void;
  onOpenConversation: (sessionId: string) => void;
}) {
  const drawer = useWorkstationLayoutStore((state) => state.mobileDrawer);
  const setMobileDrawerOpen = useWorkstationLayoutStore((state) => state.setMobileDrawerOpen);
  const setMobileDrawerSnap = useWorkstationLayoutStore((state) => state.setMobileDrawerSnap);
  const dragStartY = useRef<number | null>(null);
  const startSnap = useRef<"peek" | "half" | "full">("half");
  const minHeight = useMemo(
    () => (drawer.open ? SNAP_HEIGHT[drawer.snap] : "56px"),
    [drawer.open, drawer.snap],
  );

  return (
    <aside
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 flex flex-col overflow-hidden rounded-t-2xl border-t border-white/15 bg-slate-950/95 shadow-[0_-20px_60px_rgba(0,0,0,0.45)] backdrop-blur"
      style={{
        minHeight,
        maxHeight: "85dvh",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-2 text-left"
        onClick={() => setMobileDrawerOpen(!drawer.open)}
        onPointerDown={(event) => {
          dragStartY.current = event.clientY;
          startSnap.current = drawer.snap;
        }}
        onPointerMove={(event) => {
          if (dragStartY.current === null) return;
          const delta = dragStartY.current - event.clientY;
          if (Math.abs(delta) < 24) return;
          if (delta > 0) {
            if (startSnap.current === "peek") setMobileDrawerSnap("half");
            else setMobileDrawerSnap("full");
            setMobileDrawerOpen(true);
          } else {
            if (startSnap.current === "full") setMobileDrawerSnap("half");
            else if (startSnap.current === "half") setMobileDrawerSnap("peek");
            else setMobileDrawerOpen(false);
          }
          dragStartY.current = null;
        }}
        onPointerUp={() => {
          dragStartY.current = null;
        }}
        onPointerCancel={() => {
          dragStartY.current = null;
        }}
      >
        <span className="mx-auto mb-1 block h-1 w-10 rounded-full bg-white/35" />
        <span className="sr-only">Toggle Helix Ask drawer</span>
      </button>

      <div className="flex items-center justify-between px-4 pb-2">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-300">
          <MessageCircle className="h-4 w-4" />
          Helix Ask
        </div>
        <div className="flex items-center gap-1">
          {(["peek", "half", "full"] as const).map((snap) => (
            <button
              key={snap}
              type="button"
              onClick={() => {
                setMobileDrawerOpen(true);
                setMobileDrawerSnap(snap);
              }}
              className={`rounded border px-2 py-1 text-[10px] uppercase tracking-wide ${
                drawer.snap === snap
                  ? "border-sky-300/60 bg-sky-500/20 text-sky-100"
                  : "border-white/20 text-slate-300"
              }`}
            >
              {snap}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-3 pb-3">
        <HelixAskConsole
          className={`w-full ${drawer.open ? "flex h-full min-h-0 flex-col" : "h-0 min-h-0 overflow-hidden opacity-0"}`}
          contextId={HELIX_ASK_CONTEXT_ID.mobile}
          maxWidthClassName="max-w-none"
          layoutVariant="dock"
          onOpenPanel={onOpenPanel}
          onOpenConversation={onOpenConversation}
        />
      </div>
    </aside>
  );
}
