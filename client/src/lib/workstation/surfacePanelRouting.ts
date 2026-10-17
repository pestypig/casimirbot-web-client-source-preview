import {
  SurfacePanelRouteReceiptSchema,
  type SurfacePanelRouteReceipt,
} from "@shared/helix-surface-registry";

export const HELIX_SURFACE_PANEL_ROUTE_EVENT = "helix:surface-panel-route";

const latestRouteByPanel = new Map<string, SurfacePanelRouteReceipt>();

export function publishSurfacePanelRoute(
  input: SurfacePanelRouteReceipt,
): SurfacePanelRouteReceipt {
  const route = SurfacePanelRouteReceiptSchema.parse(input);
  latestRouteByPanel.set(route.target_panel_id, route);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<SurfacePanelRouteReceipt>(HELIX_SURFACE_PANEL_ROUTE_EVENT, {
        detail: route,
      }),
    );
  }
  return route;
}

export function readLatestSurfacePanelRoute(
  panelId: string,
): SurfacePanelRouteReceipt | null {
  return latestRouteByPanel.get(panelId) ?? null;
}

export function clearSurfacePanelRoutesForTests(): void {
  latestRouteByPanel.clear();
}

