import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  (globalThis as Record<string, unknown>).__HELIX_ASK_JOB_TIMEOUT_MS__ = "1200000";
  return {};
});

import { executeHelixPanelActionAsync } from "@/lib/workstation/panelActionAdapters";
import { executeWorkstationActionWithLedger } from "@/lib/workstation/workstationActionExecutor";
import { useDocumentImageRegionStore } from "@/store/useDocumentImageRegionStore";
import { useWorkstationActionExecutionStore } from "@/store/useWorkstationActionExecutionStore";

const initialDocumentState = useDocumentImageRegionStore.getState();

const context = {
  openPanel: vi.fn(),
  focusPanel: vi.fn(),
  closePanel: vi.fn(),
  openSettings: vi.fn(),
};

describe("Image Lens focus panel action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDocumentImageRegionStore.setState(initialDocumentState, true);
    useWorkstationActionExecutionStore.getState().reset();
  });

  it("returns a blocked non-terminal artifact instead of answer text when no image source exists", async () => {
    const result = await executeHelixPanelActionAsync(
      {
        panel_id: "image-lens",
        action_id: "image_lens.focus_regions",
        args: {
          sourceId: "visual_source:missing",
          regions: [
            {
              bboxPct: { x: 0, y: 0, width: 1, height: 1 },
              reason: "full frame",
            },
          ],
        },
      },
      context,
    );

    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/blocked/i);
    expect(result.artifact).toMatchObject({
      kind: "image_lens_focus_run_result",
      status: "blocked",
      assistant_answer: false,
      terminal_eligible: false,
      claimBoundary: {
        observationOnly: true,
        notAnswerAuthority: true,
      },
      blockers: ["image_lens_focus_run_source_not_available"],
    });
    expect(context.openPanel).toHaveBeenCalledWith("image-lens", undefined);
    expect(context.focusPanel).toHaveBeenCalledWith("image-lens", undefined);
  });

  it("records blocked focus runs in the workstation ledger as receipts", async () => {
    const execution = await executeWorkstationActionWithLedger({
      request: {
        panel_id: "live-answer-environment",
        action_id: "image_lens.focus_regions",
        args: {
          sourceId: "visual_source:missing",
          regions: [
            {
              bboxPct: { x: 0, y: 0, width: 1, height: 1 },
              reason: "full frame",
            },
          ],
        },
      },
      context,
    });

    expect(execution.completed).toBe(true);
    expect(execution.receipt).toMatchObject({
      schema: "helix.workstation_action_receipt.v1",
      panel_id: "live-answer-environment",
      action_id: "image_lens.focus_regions",
      receipt_kind: "image_lens_focus_run_result",
      deterministic_content_role: "observation_not_assistant_answer",
      artifact: {
        status: "blocked",
        terminal_eligible: false,
      },
    });
  });
});
