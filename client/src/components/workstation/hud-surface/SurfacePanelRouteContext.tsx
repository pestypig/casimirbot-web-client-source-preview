import React, { createContext, useContext } from "react";
import type { SurfacePanelRouteReceipt } from "@shared/helix-surface-registry";

const SurfacePanelRouteContext = createContext<SurfacePanelRouteReceipt | null>(null);

export function SurfacePanelRouteProvider({
  route,
  children,
}: {
  route: SurfacePanelRouteReceipt | null;
  children: React.ReactNode;
}) {
  return (
    <SurfacePanelRouteContext.Provider value={route}>
      {children}
    </SurfacePanelRouteContext.Provider>
  );
}

export function useSurfacePanelRoute(): SurfacePanelRouteReceipt | null {
  return useContext(SurfacePanelRouteContext);
}

