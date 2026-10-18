import { HelixAskConsole } from "@/components/helix/ask-console/HelixAskConsole";
import { HELIX_ASK_CONTEXT_ID } from "@/lib/helix/voice-surface-contract";
import type { PanelDefinition } from "@/lib/desktop/panelRegistry";

export function HelixAskDock({
  widthPx,
  collapsed,
  contextId = HELIX_ASK_CONTEXT_ID.desktop,
  placement = "side",
  onOpenPanel,
  onOpenConversation,
}: {
  widthPx: number | string;
  collapsed: boolean;
  contextId?: string;
  placement?: "side" | "bottom";
  onOpenPanel: (panelId: PanelDefinition["id"]) => void;
  onOpenConversation: (sessionId: string) => void;
}) {
  const isBottomPlacement = placement === "bottom";

  return (
    <aside
      className={`relative z-20 min-h-0 bg-slate-950/80 backdrop-blur ${
        isBottomPlacement
          ? "h-full w-full border-t border-white/10"
          : "h-full border-l border-white/10"
      }`}
      style={{ width: widthPx }}
    >
      <div
        className={`flex h-full min-h-0 flex-col px-2 ${
          isBottomPlacement ? "pb-2 pt-1" : "py-2"
        }`}
      >
        <div
          aria-hidden
          className={`${isBottomPlacement ? "mb-1 h-0" : "mb-2 h-7"} shrink-0`}
        />
        {!collapsed ? (
          <>
            <HelixAskConsole
              key={contextId}
              className="flex h-full min-h-0 w-full flex-col"
              contextId={contextId}
              maxWidthClassName="max-w-none"
              layoutVariant="dock"
              onOpenPanel={onOpenPanel}
              onOpenConversation={onOpenConversation}
            />
          </>
        ) : null}
      </div>
    </aside>
  );
}
