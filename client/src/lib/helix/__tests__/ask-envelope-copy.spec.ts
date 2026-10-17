import { describe, expect, it } from "vitest";
import {
  formatEnvelopeSectionsForCopy,
  normalizeHelixAskEnvelopeCitations,
} from "@/lib/helix/ask-envelope-copy";

describe("Helix Ask envelope copy formatting", () => {
  it("normalizes citation arrays without trimming rendered source text", () => {
    expect(normalizeHelixAskEnvelopeCitations(["docs/a.md", "  docs/b.md  ", "", 42, null])).toEqual([
      "docs/a.md",
      "  docs/b.md  ",
    ]);
    expect(normalizeHelixAskEnvelopeCitations("docs/a.md")).toEqual([]);
  });

  it("formats sections with titles, body text, and source lines", () => {
    expect(
      formatEnvelopeSectionsForCopy([
        {
          title: "Details",
          body: "First detail.",
          citations: ["docs/a.md", "docs/b.md"],
        },
        {
          title: "Proof",
          body: "Proof body.",
          citations: [],
        },
      ]),
    ).toBe(["Details\nFirst detail.\nSources: docs/a.md, docs/b.md", "Proof\nProof body."].join("\n\n"));
  });

  it("hides matching section titles while preserving body and sources", () => {
    expect(
      formatEnvelopeSectionsForCopy(
        [
          {
            title: "Details",
            body: "Body only copy.",
            citations: ["docs/source.md"],
          },
        ],
        "details",
      ),
    ).toBe("Body only copy.\nSources: docs/source.md");
  });

  it("filters empty sections and coerces non-string body values", () => {
    expect(
      formatEnvelopeSectionsForCopy([
        {
          title: "",
          body: "",
          citations: [],
        },
        {
          title: "Count",
          body: 7,
          citations: ["docs/count.md"],
        },
      ]),
    ).toBe("Count\n7\nSources: docs/count.md");
  });
});
