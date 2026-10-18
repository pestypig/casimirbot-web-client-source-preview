import { describe, expect, it } from "vitest";
import type { HelixWorkstationAction } from "@/lib/workstation/workstationActionContract";
import {
  cloneRunPanelActionWithArgs,
  extractPendingArgFromReply,
  parseWorkstationConfirmationReply,
  readDocTopicResolutionMeta,
  stripDocTopicResolutionMetaFromArgs,
} from "../ask-workstation-pending-input";

describe("ask workstation pending-input helpers", () => {
  it("parses confirmation replies without executing workstation actions", () => {
    expect(parseWorkstationConfirmationReply(" yes, go ahead")).toBe(true);
    expect(parseWorkstationConfirmationReply("0")).toBe(false);
    expect(parseWorkstationConfirmationReply("do not continue")).toBe(false);
    expect(parseWorkstationConfirmationReply("maybe later")).toBeNull();
    expect(parseWorkstationConfirmationReply("   ")).toBeNull();
  });

  it("extracts missing arguments from direct, quoted, and path-like replies", () => {
    expect(extractPendingArgFromReply("text", "  use this full reply  ")).toBe("use this full reply");
    expect(extractPendingArgFromReply("title", 'call it "Research Notes"')).toBe("Research Notes");
    expect(extractPendingArgFromReply("path", "open docs/research/nhm2-current-status.md please")).toBe(
      "docs/research/nhm2-current-status.md",
    );
    expect(extractPendingArgFromReply("path", "C:\\Users\\dan\\Desktop\\paper.md")).toBe(
      "C:\\Users\\dan\\Desktop\\paper.md",
    );
    expect(extractPendingArgFromReply("path", "no file here")).toBeNull();
  });

  it("clones run-panel actions with replacement args and leaves other actions untouched", () => {
    const runAction: HelixWorkstationAction = {
      action: "run_panel_action",
      panel_id: "docs-viewer",
      action_id: "open_doc",
      args: { path: "old.md" },
    };
    const openAction: HelixWorkstationAction = { action: "open_panel", panel_id: "docs-viewer" };

    expect(cloneRunPanelActionWithArgs(runAction, { path: "new.md" })).toEqual({
      ...runAction,
      args: { path: "new.md" },
    });
    expect(cloneRunPanelActionWithArgs(openAction, { path: "ignored.md" })).toBe(openAction);
  });

  it("reads and bounds docs topic resolution metadata", () => {
    expect(
      readDocTopicResolutionMeta({
        action: "run_panel_action",
        panel_id: "docs-viewer",
        action_id: "open_doc",
        args: {
          _doc_resolution_status: " ambiguous ",
          _doc_resolution_confidence: 1.4,
          _doc_resolution_topic: " NHM2 ",
          _doc_resolution_candidates: [" a.md ", "", "b.md", "c.md", "d.md"],
        },
      }),
    ).toEqual({
      status: "ambiguous",
      confidence: 1,
      topic: "NHM2",
      candidates: ["a.md", "b.md", "c.md"],
    });
    expect(
      readDocTopicResolutionMeta({
        action: "run_panel_action",
        panel_id: "scientific-calculator",
        action_id: "solve_expression",
        args: { _doc_resolution_status: "weak" },
      }),
    ).toBeNull();
  });

  it("strips private docs topic resolution fields without mutating user args", () => {
    const args = {
      path: "docs/a.md",
      _doc_resolution_status: "weak",
      _doc_resolution_confidence: 0.2,
      _doc_resolution_topic: "topic",
      _doc_resolution_candidates: ["docs/a.md"],
    };

    expect(stripDocTopicResolutionMetaFromArgs(args)).toEqual({ path: "docs/a.md" });
    expect(args).toHaveProperty("_doc_resolution_status", "weak");
  });
});
