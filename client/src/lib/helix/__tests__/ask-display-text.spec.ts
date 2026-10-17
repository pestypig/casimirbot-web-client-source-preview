import { describe, expect, it } from "vitest";
import { humanizeAskLiveEventToken } from "@/lib/helix/ask-display-text";

describe("Helix Ask display text helpers", () => {
  it("humanizes live event tokens without changing semantic authority", () => {
    expect(humanizeAskLiveEventToken("Helix Ask: route_selected")).toBe("route selected");
    expect(humanizeAskLiveEventToken("tool-result_api_url")).toBe("tool result API URL");
    expect(humanizeAskLiveEventToken("  llm_decision-id  ")).toBe("LLM decision ID");
    expect(humanizeAskLiveEventToken("")).toBe("");
  });
});
