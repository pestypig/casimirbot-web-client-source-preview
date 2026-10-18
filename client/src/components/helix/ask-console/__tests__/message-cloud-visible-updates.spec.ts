// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderMessageCloud } from "../../../../../../apps/desktop/src/message-cloud-renderer";

describe("Codex cloud visible updates", () => {
  it("keeps historical Responses decisions visible without claiming a live worker", () => {
    document.body.innerHTML = '<div id="cloud"><h1></h1><p id="hint"></p><ol id="turns"></ol></div>';
    const list = document.getElementById("turns") as HTMLOListElement;
    expect(renderMessageCloud(list, {
      schema: "helix.message_cloud_frame.v1", source: "session_activity",
      helixConversationId: "chat:fixture", codexSourceStatus: "unpaired",
      responsesWorkerStatus: "activity_recorded",
      turns: [{ id: "responses:one", lane: "responses_worker", kind: "decision",
        author: "responses_worker", prompt: "", delivery: "reported",
        report: { status: "completed", text: "Selected walk_to_waypoint. No action started." } }],
    })).toBe(true);
    expect(document.getElementById("hint")?.textContent).toContain(
      "Responses worker: activity recorded; live status unverified");
    expect(list.textContent).toContain("Selected walk_to_waypoint. No action started.");
  });

  it("renders user-visible progress ahead of the final answer", () => {
    document.body.innerHTML = '<div id="cloud"><h1></h1><p id="hint"></p><ol id="turns"></ol></div>';
    const list = document.getElementById("turns") as HTMLOListElement;
    expect(renderMessageCloud(list, {
      schema: "helix.codex_conversation_cloud_frame.v1",
      taskId: "01a0798b-b5bd-7bf2-946a-9a77e086316a",
      turns: [{ id: "turn:one", user: "Check the build", assistant: "The build passed.",
        assistantPhase: "final_answer", status: "completed",
        updates: ["Running the package check.", "Verifying the output."],
      }],
    })).toBe(true);
    expect(list.textContent).toContain("Running the package check.");
    expect(list.textContent).toContain("Verifying the output.");
    expect(list.textContent).toContain("The build passed.");
    expect(list.textContent?.indexOf("Verifying the output.")).toBeLessThan(
      list.textContent?.indexOf("The build passed.") ?? 0);
  });
});

