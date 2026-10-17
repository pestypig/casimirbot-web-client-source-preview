// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { buildDocScalarCalculatorLaunch, dispatchDocCalculatorLaunch } from "../docCalculatorLaunch";
import { buildDocRuntimeCalculatorLaunch } from "../docRuntimeCommandRegistry";
import { useScientificCalculatorStore } from "@/store/useScientificCalculatorStore";
import { useTheoryRuntimeJobStore } from "@/store/useTheoryRuntimeJobStore";
import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";

describe("Docs calculator launch", () => {
  beforeEach(() => {
    useScientificCalculatorStore.getState().clear();
    useTheoryRuntimeJobStore.setState({ selectedSetup: null, selectedSource: null, selectedRequestId: null, recentRequestIds: [], jobsByRequestId: {}, activeContext: null });
  });

  it("opens/focuses the calculator and prefills a scalar without solving", () => {
    dispatchDocCalculatorLaunch(buildDocScalarCalculatorLaunch({ latex: "x^2", docPath: "docs/math.md", anchor: "eq-1" }));
    const layout = useWorkstationLayoutStore.getState();
    expect(layout.groups[layout.activeGroupId]?.activePanelId).toBe("scientific-calculator");
    expect(useScientificCalculatorStore.getState().currentLatex).toBe("x^2");
    expect(useScientificCalculatorStore.getState().lastSolve).toBeNull();
  });

  it("loads the runtime workbench without executing a job", () => {
    const launch = buildDocRuntimeCalculatorLaunch({ commandText: "npm run solar:manifest", docPath: "docs/solar.md" });
    expect(launch).not.toBeNull();
    dispatchDocCalculatorLaunch(launch!);
    expect(useTheoryRuntimeJobStore.getState()).toMatchObject({ selectedSetup: { runtimeId: "solar.manifest" }, selectedRequestId: null, recentRequestIds: [] });
  });
});
