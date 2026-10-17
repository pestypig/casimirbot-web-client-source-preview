import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const helixAskPillSource = () =>
  fs.readFileSync(
    path.resolve(__dirname, "../helix/HelixAskPill.tsx"),
    "utf8",
  );

const steeringQueuePanelSource = () =>
  fs.readFileSync(
    path.resolve(__dirname, "../helix/ask-console/HelixAskSteeringQueuePanel.tsx"),
    "utf8",
  );

const goalPillSource = () =>
  fs.readFileSync(
    path.resolve(__dirname, "../helix/ask-console/HelixAskGoalPill.tsx"),
    "utf8",
  );

const steeringQueueDisplaySource = () =>
  fs.readFileSync(
    path.resolve(__dirname, "../../lib/helix/ask-steering-queue-display.ts"),
    "utf8",
  );

describe("HelixAskPill steering queue retirement", () => {
  it("keeps the compact goal-session pill without mounting the old steering queue", () => {
    const source = helixAskPillSource();
    const goal = goalPillSource();
    const goalIndex = source.indexOf("<HelixAskGoalPill");
    const queueIndex = source.indexOf("<HelixAskSteeringQueuePanel");

    expect(goalIndex).toBeGreaterThan(0);
    expect(queueIndex).toBe(-1);
    expect(goal).toContain('aria-label="Helix Ask goal session"');
    expect(goal).toContain('aria-controls="helix-ask-goal-pill-details"');
    expect(goal).toContain('aria-label="Edit goal prompt"');
    expect(goal).toContain('aria-label={isPaused ? "Resume goal" : "Pause goal"}');
    expect(goal).toContain('aria-label="Archive goal"');
    expect(source).toContain('postHelixAskGoalSessionAction');
    expect(source).toContain('/api/helix/stage-play/goal-session/action');
  });

  it("keeps the recrowned steering queue component available but not mounted by HelixAskPill", () => {
    const source = helixAskPillSource();
    const panel = steeringQueuePanelSource();

    expect(source).not.toContain("steeringQueueExpanded");
    expect(source).not.toContain("<HelixAskSteeringQueuePanel");
    expect(source).not.toContain("expanded={steeringQueueExpanded}");
    expect(source).not.toContain("onToggleExpanded={() => setSteeringQueueExpanded((current) => !current)}");
    expect(source).toContain("steeringQueue={null}");
    expect(panel).toContain('aria-controls="helix-ask-steering-queue-items"');
    expect(panel).toContain('data-expanded={expanded ? "true" : "false"}');
    expect(panel).toContain('{expanded ? "Hide" : "Show"}');
  });

  it("does not render the old steering queue title and description", () => {
    const source = helixAskPillSource();

    expect(source).not.toContain(">Steering Queue<");
    expect(source).not.toContain("Next up at top. Completed steering remains below in chronological order.");
  });

  it("separates raw observer backlog from Ask-ready micro-reasoner findings", () => {
    const source = steeringQueueDisplaySource();

    expect(source).not.toContain('label: "Unread mail waiting"');
    expect(source).toContain('label: "Observer backlog"');
    expect(source).toContain("not Ask-ready");
    expect(source).toContain('label: status === "completed" ? "Processed finding handled" : "Micro-reasoner finding"');
    expect(source).toContain('statusForHelixProcessedFinding');
    expect(source).toContain('isHelixQueuePacketBackedAskWake');
    expect(source).toContain('label: rawStatus === "waiting_for_ui_handoff"');
    expect(source).toContain('"Ask handoff deferred"');
  });
});
