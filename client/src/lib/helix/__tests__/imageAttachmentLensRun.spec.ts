// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runImageAttachmentLensRun } from "@/lib/helix/imageAttachmentLensRun";
import { useDocumentImageRegionStore } from "@/store/useDocumentImageRegionStore";
import { executeWorkstationActionWithLedger } from "@/lib/workstation/workstationActionExecutor";

vi.mock("@/lib/workstation/workstationActionExecutor", () => ({
  executeWorkstationActionWithLedger: vi.fn(),
}));

const initialDocumentState = useDocumentImageRegionStore.getState();
const mockedExecuteWorkstationActionWithLedger = vi.mocked(executeWorkstationActionWithLedger);

describe("runImageAttachmentLensRun", () => {
  beforeEach(() => {
    mockedExecuteWorkstationActionWithLedger.mockReset();
    useDocumentImageRegionStore.setState(initialDocumentState, true);
  });

  afterEach(() => {
    useDocumentImageRegionStore.setState(initialDocumentState, true);
  });

  it("loads an admitted image attachment into Image Lens and submits a broad observation action", async () => {
    const openEvents: Array<string> = [];
    window.addEventListener("open-helix-panel", ((event: Event) => {
      const detail = (event as CustomEvent).detail as { id?: string } | undefined;
      if (detail?.id) openEvents.push(detail.id);
    }) as EventListener);
    mockedExecuteWorkstationActionWithLedger.mockResolvedValue({
      execution_id: "execution:1",
      completed: true,
      receipt: null,
      result: {
        ok: true,
        panel_id: "image-lens",
        action_id: "image_lens.focus_regions",
        artifact: {
          kind: "image_lens_focus_run_result",
          status: "submitted",
          submittedRegions: [
            {
              regionId: "image-attachment:broad-full-image",
              frameId: "visual_frame:broad",
              evidenceId: "visual_evidence:broad",
              summary: "Broad image summary.",
            },
          ],
          blockers: [],
        },
      },
    });

    const artifact = await runImageAttachmentLensRun({
      prompt: "Inspect this attached image and crop the equation.",
      threadId: "helix-ask:desktop",
      turnId: "ask:1",
      traceId: "ask:1",
      attachment: {
        id: "attachment:1",
        fileName: "equation.png",
        mimeType: "image/png",
        imageBase64: "source",
        previewUrl: "blob:preview",
      },
    });

    expect(useDocumentImageRegionStore.getState().source).toMatchObject({
      sourceImageUrl: "data:image/png;base64,source",
      sourceAttachmentId: "helix-ask-image-attachment:attachment:1",
      sourceKind: "image_attachment",
    });
    expect(openEvents).toContain("image-lens");
    expect(mockedExecuteWorkstationActionWithLedger).toHaveBeenCalledWith(expect.objectContaining({
      thread_id: "helix-ask:desktop",
      turn_id: "ask:1",
      trace_id: "ask:1",
      request: expect.objectContaining({
        panel_id: "image-lens",
        action_id: "image_lens.focus_regions",
        args: expect.objectContaining({
          mode: "regions_only",
          maxRegions: 1,
          regions: [
            expect.objectContaining({
              regionId: "image-attachment:broad-full-image",
              bboxPct: { x: 0, y: 0, width: 1, height: 1 },
            }),
          ],
        }),
      }),
    }));
    expect(artifact).toMatchObject({
      contractVersion: "image_attachment_lens_run/v1",
      admission: {
        admitted: true,
        autoOpenedImageLens: true,
      },
      broadObservation: {
        requested: true,
        status: "submitted",
        frameHistoryId: "visual_frame:broad",
        evidenceId: "visual_evidence:broad",
        summary: "Broad image summary.",
      },
      claimBoundary: {
        observationOnly: true,
        notAnswerAuthority: true,
        requiresSolverReentry: true,
      },
    });
  });

  it("does not open panels or run actions for non-admitted prompts", async () => {
    const artifact = await runImageAttachmentLensRun({
      prompt: "Don't open Image Lens for this attachment.",
      threadId: "helix-ask:desktop",
      attachment: {
        id: "attachment:2",
        fileName: "image.png",
        mimeType: "image/png",
        imageBase64: "source",
        previewUrl: "blob:preview",
      },
    });

    expect(mockedExecuteWorkstationActionWithLedger).not.toHaveBeenCalled();
    expect(useDocumentImageRegionStore.getState().source).toBeNull();
    expect(artifact.admission.admitted).toBe(false);
    expect(artifact.broadObservation.status).toBe("not_requested");
  });
});
