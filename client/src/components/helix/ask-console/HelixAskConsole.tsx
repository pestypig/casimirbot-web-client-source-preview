import React, { Suspense } from "react";
import { HelixLoadingMark } from "@/components/common/HelixLoadingMark";
import { HelixAskConsoleRuntimeShell } from "./HelixAskConsoleRuntimeShell";
import { shouldRenderHelixAskOperatorSurfaceParityHarness } from "./HelixAskOperatorSurfaceParityRoute";
import type { HelixAskConsoleProps } from "./HelixAskConsoleState";

const HelixAskOperatorSurfaceParityHarness = React.lazy(async () => {
  const module = await import("./HelixAskOperatorSurfaceParityHarness");
  return { default: module.HelixAskOperatorSurfaceParityHarness };
});

export function HelixAskConsole(props: HelixAskConsoleProps) {
  const search = typeof window === "undefined" ? "" : window.location.search;
  if (shouldRenderHelixAskOperatorSurfaceParityHarness(search)) {
    return (
      <Suspense fallback={<HelixLoadingMark title="Loading Helix Ask parity" compact />}>
        <HelixAskOperatorSurfaceParityHarness {...props} />
      </Suspense>
    );
  }
  return <HelixAskConsoleRuntimeShell {...props} />;
}
