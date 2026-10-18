import type { ReactNode } from "react";
import type { PanelDefinition } from "@/lib/desktop/panelRegistry";
import { MobileHelixAskDrawer } from "@/components/workstation/mobile/MobileHelixAskDrawer";

export function MobileWorkstationShell({
  children,
  onOpenPanel,
  onOpenConversation,
}: {
  children: ReactNode;
  onOpenPanel: (panelId: PanelDefinition["id"]) => void;
  onOpenConversation: (sessionId: string) => void;
}) {
  return (
    <>
      {children}
      <MobileHelixAskDrawer
        onOpenPanel={onOpenPanel}
        onOpenConversation={onOpenConversation}
      />
    </>
  );
}
