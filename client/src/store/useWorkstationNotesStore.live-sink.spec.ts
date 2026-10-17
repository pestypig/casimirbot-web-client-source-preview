import { beforeEach, describe, expect, it } from "vitest";
import { useWorkstationNotesStore } from "@/store/useWorkstationNotesStore";

describe("workstation notes live sink", () => {
  beforeEach(() => {
    useWorkstationNotesStore.setState({ notes: {}, order: [], active_note_id: undefined });
  });

  it("appends transformed live chunks with citation metadata", () => {
    const note = useWorkstationNotesStore.getState().appendLiveNoteChunk({
      note_id: "note:live",
      title: "Live transcript note",
      topic: "transcript",
      chunk_text: "Speaker claim summarized without raw audio.",
      trace_id: "trace:live:1",
      citation: {
        id: "citation:1",
        path: "live-pipeline://trace:live:1",
        heading: "Live transform",
        start_offset: 0,
        end_offset: 38,
      },
      snippet: {
        id: "snippet:1",
        citation_id: "citation:1",
        excerpt: "Speaker claim summarized without raw audio.",
      },
    });

    expect(note.body).toContain("Speaker claim summarized");
    expect(note.citations).toHaveLength(1);
    expect(note.snippets).toHaveLength(1);
    expect(useWorkstationNotesStore.getState().active_note_id).toBe("note:live");
  });
});
