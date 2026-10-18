import React from "react";

import {
  HelixAskConsoleRuntimeShell,
  type HelixAskConsoleRuntimeShellProps,
} from "./HelixAskConsoleRuntimeShell";
import type { HelixAskConsoleProps } from "./HelixAskConsoleState";
import { HelixAskOperatorSurfaceParityEvidencePanel } from "./HelixAskOperatorSurfaceParityEvidencePanel";

export type HelixAskOperatorSurfaceParityHarnessProps = HelixAskConsoleProps & {
  minimalRuntime?: HelixAskConsoleRuntimeShellProps["minimalRuntime"];
  legacyLabel?: string;
  recrownedLabel?: string;
};

export function buildHelixAskOperatorSurfaceParityHarnessContextIds(contextId: string) {
  return {
    legacyContextId: `${contextId}:legacy-parity`,
    recrownedContextId: `${contextId}:recrowned-parity`,
  };
}

export function HelixAskOperatorSurfaceParityHarness({
  minimalRuntime,
  legacyLabel = "Current bridge",
  recrownedLabel = "Recrowned shell",
  ...props
}: HelixAskOperatorSurfaceParityHarnessProps) {
  const { legacyContextId, recrownedContextId } = buildHelixAskOperatorSurfaceParityHarnessContextIds(
    props.contextId,
  );
  const routeSearch = typeof window !== "undefined" ? window.location.search : "";

  return (
    <section
      className="grid gap-4"
      data-testid="helix-ask-operator-surface-parity-harness"
      data-parity-harness="operator_surface"
    >
      <HelixAskOperatorSurfaceParityEvidencePanel routeSearch={routeSearch} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div
          className="min-w-0"
          data-testid="helix-ask-operator-surface-parity-legacy"
          data-runtime-implementation="legacy_bridge"
        >
          <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100/60">
            {legacyLabel}
          </p>
          <HelixAskConsoleRuntimeShell
            {...props}
            contextId={legacyContextId}
            runtimeImplementation="legacy_bridge"
          />
        </div>
        <div
          className="min-w-0"
          data-testid="helix-ask-operator-surface-parity-recrowned"
          data-runtime-implementation="minimal_runtime_shell"
        >
          <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100/60">
            {recrownedLabel}
          </p>
          <HelixAskConsoleRuntimeShell
            {...props}
            contextId={recrownedContextId}
            runtimeImplementation="minimal_runtime_shell"
            minimalRuntime={minimalRuntime}
          />
        </div>
      </div>
    </section>
  );
}
