import { describe, expect, it } from "vitest";
import {
  buildDocRuntimeCalculatorLaunch,
  findRegisteredDocRuntimeCommand,
  findRegisteredDocRuntimeReference,
} from "../docRuntimeCommandRegistry";

describe("Docs runtime command registry", () => {
  it("recognizes only an exact executable registered command", () => {
    expect(findRegisteredDocRuntimeCommand("npm run solar:manifest")?.runtimeId).toBe("solar.manifest");
    expect(buildDocRuntimeCalculatorLaunch({ commandText: "npm run solar:manifest", docPath: "docs/solar.md" })).toMatchObject({ kind: "runtime", runtime: { runtimeId: "solar.manifest", requestedScope: "quick" } });
  });

  it.each([
    "npm run solar:manifest -- --extra",
    "npm run solar:manifest\nnpm run physics:validate",
    "echo npm run solar:manifest",
    "npm run warp:full-solve:campaign",
    "`npm run solar:manifest`",
  ])("keeps arbitrary or non-executable command text inert: %s", (commandText) => {
    expect(findRegisteredDocRuntimeCommand(commandText)).toBeNull();
  });

  it("loads the allowlisted long runtime as full scope without executing it", () => {
    expect(buildDocRuntimeCalculatorLaunch({ commandText: "npm run warp:full-solve:nhm2-shift-lapse:alpha-sweep" })).toMatchObject({ runtime: { runtimeId: "nhm2.shift_lapse.alpha_sweep", requestedScope: "full" } });
  });

  it("resolves exact executable runtime IDs as non-executing docs references", () => {
    expect(findRegisteredDocRuntimeReference("casimir.verify")?.command).toBe("npm run casimir:verify");
    expect(buildDocRuntimeCalculatorLaunch({ commandText: "nhm2.shift_lapse.alpha_sweep" })).toMatchObject({
      kind: "runtime",
      runtime: {
        runtimeId: "nhm2.shift_lapse.alpha_sweep",
        command: "npm run warp:full-solve:nhm2-shift-lapse:alpha-sweep",
        requestedScope: "full",
      },
    });
  });

  it.each([
    "run casimir.verify",
    "do not run casimir.verify",
    "maybe casimir.verify later",
    "previously ran casimir.verify",
    "\"casimir.verify\"",
    "casimir.verify --extra",
    "warp.full_solve.campaign",
  ])("keeps contextual, altered, or non-executable runtime references inert: %s", (referenceText) => {
    expect(findRegisteredDocRuntimeReference(referenceText)).toBeNull();
    expect(buildDocRuntimeCalculatorLaunch({ commandText: referenceText })).toBeNull();
  });
});
