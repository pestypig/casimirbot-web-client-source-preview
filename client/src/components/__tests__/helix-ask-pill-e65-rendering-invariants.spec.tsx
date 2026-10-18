import { beforeAll, describe, expect, it } from "vitest";

let chooseVisibleFinalText: typeof import("@/components/helix/HelixAskPill").chooseVisibleFinalText;
let resolveHelixAskVisibleJobReadyLinks: typeof import("@/components/helix/HelixAskPill").resolveHelixAskVisibleJobReadyLinks;

beforeAll(async () => {
  (globalThis as Record<string, unknown>).__HELIX_ASK_JOB_TIMEOUT_MS__ = undefined;
  ({ chooseVisibleFinalText, resolveHelixAskVisibleJobReadyLinks } = await import("@/components/helix/HelixAskPill"));
});

describe("Helix Ask E65 rendering invariants", () => {
  it("keeps typed failure text ahead of stale successful Locations text", () => {
    const reply = {
      id: "turn-e65-rendering",
      turn_id: "turn-e65-rendering",
      content: "Locations:\n- /docs/nhm2.md:L10-L12",
      text: "Locations:\n- /docs/nhm2.md:L10-L12",
      selected_final_answer:
        "I found candidate context, but no current-turn location artifact proved the requested target.\nCause: doc_evidence_location_unavailable.",
      final_answer_source: "typed_failure",
      terminal_error_code: "doc_evidence_location_unavailable",
      final_rendering_invariant: {
        visible_answer_shape: "typed_failure",
        violations: [],
      },
    };

    const text = chooseVisibleFinalText(reply as never);

    expect(text).toContain("doc_evidence_location_unavailable");
    expect(text).not.toMatch(/^Locations:/);
  });

  it("suppresses stale note action buttons on typed failure turns", () => {
    const reply = {
      id: "turn-e65-note-link-typed-failure",
      content: "Could not materialize the note action.",
      selected_final_answer: "Could not materialize the note action.",
      final_answer_source: "typed_failure",
      terminal_artifact_kind: "typed_failure",
      debug: {
        job_ready_links: [
          {
            label: "Open note: Stage Play Live-Source Findings",
            panel_id: "workstation-notes",
            action_id: "set_active_note",
            args: { title: "Stage Play Live-Source Findings" },
          },
        ],
      },
    };

    expect(resolveHelixAskVisibleJobReadyLinks(reply)).toEqual([]);
  });

  it("keeps complete note action buttons for successful terminal turns", () => {
    const reply = {
      id: "turn-e65-note-link-success",
      content: "Updated the note.",
      selected_final_answer: "Updated the note.",
      final_answer_source: "final_answer_draft",
      terminal_artifact_kind: "model_synthesized_answer",
      debug: {
        job_ready_links: [
          {
            label: "Open note: Stage Play Live-Source Findings",
            panel_id: "workstation-notes",
            action_id: "set_active_note",
            args: { title: "Stage Play Live-Source Findings" },
          },
        ],
      },
    };

    expect(resolveHelixAskVisibleJobReadyLinks(reply)).toHaveLength(1);
  });
});
