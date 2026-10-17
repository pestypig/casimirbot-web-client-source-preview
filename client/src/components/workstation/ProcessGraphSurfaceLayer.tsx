import * as React from "react";
import type { LumaMood } from "@/lib/luma-moods";
import { createWorkstationProcessGraphDisplaySelector } from "@/lib/workstation/processGraph/processGraphDisplayProjection";
import { renderWorkstationProcessGraphSvg } from "@/lib/workstation/processGraph/renderProcessGraphSvg";
import { useWorkstationProcessGraphStore } from "@/store/useWorkstationProcessGraphStore";

function useDocumentVisible(): boolean {
  const [visible, setVisible] = React.useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );
  React.useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}

export function ProcessGraphSurfaceLayer({
  mood,
  orientation,
  mode = "ambient",
}: {
  mood: LumaMood;
  orientation: "desktop" | "mobile";
  mode?: "ambient";
}) {
  const maxNodes = orientation === "mobile" ? 14 : 18;
  const maxEdges = orientation === "mobile" ? 20 : 28;
  const selectDisplayGraph = React.useMemo(
    () => createWorkstationProcessGraphDisplaySelector({ maxNodes, maxEdges }),
    [maxEdges, maxNodes],
  );
  const graph = useWorkstationProcessGraphStore(selectDisplayGraph);
  const documentVisible = useDocumentVisible();
  const svg = React.useMemo(
    () =>
      documentVisible
        ? renderWorkstationProcessGraphSvg({
            graph,
            width: orientation === "mobile" ? 900 : 1600,
            height: orientation === "mobile" ? 1600 : 900,
            mood,
            density: mode,
            labels: "minimal",
            maxNodes,
            maxEdges,
          })
        : "",
    [documentVisible, graph, maxEdges, maxNodes, mode, mood, orientation],
  );

  if (!documentVisible) return null;

  return (
    <div
      className="process-graph-surface-layer"
      aria-hidden="true"
      data-motion="wander"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
