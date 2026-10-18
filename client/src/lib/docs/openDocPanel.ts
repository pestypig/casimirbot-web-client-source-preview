import { useDocViewerStore } from "@/store/useDocViewerStore";
import { useDesktopStore } from "@/store/useDesktopStore";
import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";
import {
  DOC_VIEWER_PANEL_ID,
  makeDocHref,
  parseDocTarget,
  saveDocViewerIntent,
  type DocLinkDescriptor,
  type DocViewerIntent,
} from "./docViewer";

export function openDocPanel(target: DocLinkDescriptor) {
  const { path, anchor } = parseDocTarget(target);
  const autoRead = typeof target === "object" && target?.autoRead === true;
  const intent: DocViewerIntent = { mode: "doc", path, anchor, autoRead };
  const desktopState = useDesktopStore.getState();
  const hasDesktopWindow = Boolean(desktopState.windows[DOC_VIEWER_PANEL_ID]);
  const workstationState = useWorkstationLayoutStore.getState();
  const hasWorkstationPanel = Object.values(workstationState.groups).some((group) =>
    group.panelIds.includes(DOC_VIEWER_PANEL_ID),
  );
  const hasViewerInShell = hasDesktopWindow || hasWorkstationPanel;

  if (hasViewerInShell) {
    useDocViewerStore.getState().applyIntent(intent);
    if (hasDesktopWindow) {
      desktopState.open(DOC_VIEWER_PANEL_ID);
    }
    return;
  }

  // Queue the intent for the next desktop visit and fall back to opening the raw doc.
  saveDocViewerIntent(intent);
  if (typeof window !== "undefined") {
    window.open(makeDocHref(path, anchor), "_blank", "noopener");
  }
}
