import { describe, expect, it } from "vitest";
import { describeHelixAskWorkerRelayStatus } from "@/components/helix/ask-console/HelixAskLiveRuntimeControls";

describe("Helix Ask live worker relay status", () => {
  it.each([
    ["worker_running", "Checking workspace", "checking"],
    ["result_ready", "Result ready", "ready"],
    ["relay_queued_busy", "Result ready", "ready"],
    ["response_requested", "Result ready", "ready"],
    ["provider_acknowledged", "Result ready", "ready"],
    ["speaking", "Speaking result", "speaking"],
  ] as const)("projects %s as passive status text", (status, label, icon) => {
    expect(describeHelixAskWorkerRelayStatus(status)).toEqual({ label, icon });
  });

  it.each([
    null,
    "delivered",
    "suppressed",
    "superseded",
    "stale",
    "interrupted",
    "cancelled",
    "failed",
  ] as const)("hides terminal or inapplicable status %s", (status) => {
    expect(describeHelixAskWorkerRelayStatus(status)).toBeNull();
  });
});
