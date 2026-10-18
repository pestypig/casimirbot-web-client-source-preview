import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  (globalThis as Record<string, unknown>).__HELIX_ASK_JOB_TIMEOUT_MS__ = "1200000";
  return {};
});

import { executeHelixPanelAction } from "@/lib/workstation/panelActionAdapters";

const context = {
  openPanel: vi.fn(),
  focusPanel: vi.fn(),
  closePanel: vi.fn(),
  openSettings: vi.fn(),
};

describe("panel action adapters live pipelines", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })));
  });

  it("posts create live workstation pipeline requests", () => {
    const result = executeHelixPanelAction(
      {
        panel_id: "situation-room-pipelines",
        action_id: "create_live_workstation_pipeline",
        args: {
          objective: "Summarize each sentence from this live browser tab into a note.",
          source_ids: ["source:browser-tab-transcript"],
        },
      },
      context,
    );

    expect(result.ok).toBe(true);
    expect(result.artifact).toMatchObject({
      kind: "live_workstation_pipeline_receipt",
      raw_logs_included: false,
      raw_transcript_included: false,
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/agi/situation/live-workstation-pipeline/create",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
